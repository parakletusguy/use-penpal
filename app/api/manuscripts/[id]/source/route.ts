import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit";
import { createClient } from "@/utils/supabase/server";

const WORD_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

function isDocx(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer.slice(0, 4));
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function validId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function POST(
  request: Request,
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

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid source." }, { status: 400 });
  const { contentType, fileName, storagePath } = body as Record<string, unknown>;
  const requiredPrefix = `${editorId}/${manuscriptId}/original/`;

  if (
    contentType !== WORD_MIME ||
    typeof fileName !== "string" ||
    typeof storagePath !== "string" ||
    !storagePath.startsWith(requiredPrefix) ||
    storagePath.includes("..")
  ) {
    return NextResponse.json({ error: "Invalid source." }, { status: 400 });
  }

  const { data: manuscript, error: manuscriptLookupError } = await supabase
    .from("manuscripts")
    .select("id, original_storage_path")
    .eq("id", manuscriptId)
    .eq("editor_id", editorId)
    .maybeSingle();
  if (manuscriptLookupError || !manuscript) return NextResponse.json({ error: "Manuscript not found." }, { status: 404 });
  if (manuscript.original_storage_path) return NextResponse.json({ ready: true, reused: true });

  const { data: sourceFile, error: sourceError } = await supabase.storage
    .from("penpal-manuscripts")
    .download(storagePath);
  if (sourceError || !sourceFile) return NextResponse.json({ error: "Could not read the uploaded source." }, { status: 422 });
  const sourceBuffer = await sourceFile.arrayBuffer();
  if (!sourceBuffer.byteLength || sourceBuffer.byteLength > MAX_SOURCE_BYTES || !isDocx(sourceBuffer)) {
    return NextResponse.json({ error: "The uploaded source is not a valid .docx file." }, { status: 422 });
  }
  const checksum = createHash("sha256").update(Buffer.from(sourceBuffer)).digest("hex");

  const { error: artifactError } = await supabase.from("document_artifacts").insert({
    artifact_type: "original",
    byte_size: sourceBuffer.byteLength,
    checksum,
    content_type: WORD_MIME,
    created_by: editorId,
    display_name: fileName.slice(0, 500),
    editor_id: editorId,
    manuscript_id: manuscriptId,
    storage_path: storagePath,
  });

  if (artifactError) return NextResponse.json({ error: "Could not register source." }, { status: 400 });

  const { error: manuscriptError } = await supabase
    .from("manuscripts")
    .update({ original_storage_path: storagePath, source_checksum: checksum, workflow_status: "ready_to_review" })
    .eq("id", manuscriptId)
    .eq("editor_id", editorId);

  if (manuscriptError) return NextResponse.json({ error: "Could not prepare manuscript." }, { status: 400 });

  await recordAuditEvent(supabase, {
    editorId,
    entityId: manuscriptId,
    entityType: "source_document",
    eventData: { byteSize: sourceBuffer.byteLength, source: "editor_upload" },
    eventType: "private_source_registered",
    manuscriptId,
  });

  return NextResponse.json({ ready: true }, { status: 201 });
}
