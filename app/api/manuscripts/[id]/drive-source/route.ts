import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

const WORD_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

function validId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function safeDriveFileId(value: string) {
  return /^[a-zA-Z0-9_-]{10,200}$/.test(value);
}

function isDocx(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer.slice(0, 4));
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const manuscriptId = validId(rawId);
  if (!manuscriptId) return NextResponse.json({ error: "Invalid manuscript." }, { status: 400 });

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const editorId = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;
  const email = typeof claimsData?.claims?.email === "string" ? claimsData.claims.email.toLowerCase() : null;
  const allowedEmail = process.env.PENPAL_EDITOR_EMAIL?.trim().toLowerCase();
  if (!editorId || !allowedEmail || email !== allowedEmail) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const { data: manuscript, error: manuscriptError } = await supabase
    .from("manuscripts")
    .select("id, source_file_id, source_file_name, original_storage_path")
    .eq("id", manuscriptId)
    .maybeSingle();
  if (manuscriptError || !manuscript) return NextResponse.json({ error: "Manuscript not found." }, { status: 404 });
  if (manuscript.original_storage_path) return NextResponse.json({ ready: true, reused: true });
  if (!safeDriveFileId(manuscript.source_file_id)) {
    return NextResponse.json({ error: "The source file reference is not valid." }, { status: 422 });
  }

  const driveUrl = new URL("https://drive.usercontent.google.com/download");
  driveUrl.searchParams.set("id", manuscript.source_file_id);
  driveUrl.searchParams.set("export", "download");
  driveUrl.searchParams.set("confirm", "t");

  let sourceResponse: Response;
  try {
    sourceResponse = await fetch(driveUrl, { signal: AbortSignal.timeout(30_000) });
  } catch {
    return NextResponse.json({ error: "PenPal could not download this shared Drive source." }, { status: 502 });
  }

  const reportedLength = Number(sourceResponse.headers.get("content-length"));
  if (!sourceResponse.ok || (Number.isFinite(reportedLength) && reportedLength > MAX_SOURCE_BYTES)) {
    return NextResponse.json({ error: "The Drive source is unavailable or exceeds PenPal's 50 MB limit." }, { status: 422 });
  }

  const sourceBuffer = await sourceResponse.arrayBuffer();
  if (!sourceBuffer.byteLength || sourceBuffer.byteLength > MAX_SOURCE_BYTES || !isDocx(sourceBuffer)) {
    return NextResponse.json({ error: "The Drive source is not a valid .docx file." }, { status: 422 });
  }

  const safeName = manuscript.source_file_name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${editorId}/${manuscriptId}/original/drive-${manuscript.source_file_id}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from("penpal-manuscripts")
    .upload(storagePath, sourceBuffer, { contentType: WORD_MIME, upsert: false });
  if (uploadError) return NextResponse.json({ error: "PenPal could not store the private source copy." }, { status: 422 });

  const { error: artifactError } = await supabase.from("document_artifacts").insert({
    artifact_type: "original",
    byte_size: sourceBuffer.byteLength,
    content_type: WORD_MIME,
    created_by: editorId,
    display_name: manuscript.source_file_name.slice(0, 500),
    editor_id: editorId,
    manuscript_id: manuscriptId,
    storage_path: storagePath,
  });
  if (artifactError) return NextResponse.json({ error: "PenPal could not register the private source copy." }, { status: 422 });

  const { error: updateError } = await supabase
    .from("manuscripts")
    .update({ original_storage_path: storagePath, workflow_status: "ready_to_review" })
    .eq("id", manuscriptId);
  if (updateError) return NextResponse.json({ error: "PenPal could not prepare this manuscript." }, { status: 422 });

  return NextResponse.json({ ready: true }, { status: 201 });
}
