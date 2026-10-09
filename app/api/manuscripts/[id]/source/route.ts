import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

const WORD_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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

  const { error: artifactError } = await supabase.from("document_artifacts").insert({
    artifact_type: "original",
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
    .update({ original_storage_path: storagePath, workflow_status: "ready_to_review" })
    .eq("id", manuscriptId);

  if (manuscriptError) return NextResponse.json({ error: "Could not prepare manuscript." }, { status: 400 });

  return NextResponse.json({ ready: true }, { status: 201 });
}
