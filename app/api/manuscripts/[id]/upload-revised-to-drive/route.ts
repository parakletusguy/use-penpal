import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit";
import { isDriveUploadConfigured, uploadRevisedDocumentToDrive } from "@/lib/drive/upload-revised-document";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

function validId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const manuscriptId = validId(rawId);
  if (!manuscriptId) return NextResponse.json({ error: "Invalid manuscript." }, { status: 400 });

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const editorId = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;
  const email = typeof claimsData?.claims?.email === "string" ? claimsData.claims.email.toLowerCase() : null;
  const allowedEmail = process.env.PENPAL_EDITOR_EMAIL?.trim().toLowerCase();
  if (claimsError || !editorId || !allowedEmail || email !== allowedEmail) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  if (!isDriveUploadConfigured()) {
    return NextResponse.json({ error: "Google Drive output is not configured. Add the service-account credential and output folder before uploading." }, { status: 503 });
  }

  const { data: artifact, error: artifactError } = await supabase
    .from("document_artifacts")
    .select("id, display_name, storage_path, external_provider, external_file_id, external_url")
    .eq("manuscript_id", manuscriptId)
    .eq("editor_id", editorId)
    .eq("artifact_type", "revised_manuscript")
    .order("generated_from_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (artifactError || !artifact) return NextResponse.json({ error: "Create a revised Word copy before uploading it to Drive." }, { status: 409 });
  if (artifact.external_provider === "google_drive" && artifact.external_file_id && artifact.external_url) {
    return NextResponse.json({ fileId: artifact.external_file_id, reused: true, url: artifact.external_url });
  }

  const { data: revision, error: revisionError } = await supabase.storage
    .from("penpal-manuscripts")
    .download(artifact.storage_path);
  if (revisionError || !revision) return NextResponse.json({ error: "The revised Word copy could not be read." }, { status: 409 });

  try {
    const uploaded = await uploadRevisedDocumentToDrive({
      artifactId: artifact.id,
      bytes: Buffer.from(await revision.arrayBuffer()),
      displayName: artifact.display_name,
    });
    const { error: updateError } = await supabase
      .from("document_artifacts")
      .update({
        external_file_id: uploaded.fileId,
        external_provider: "google_drive",
        external_url: uploaded.url,
        externally_delivered_at: new Date().toISOString(),
      })
      .eq("id", artifact.id)
      .eq("editor_id", editorId);
    if (updateError) throw new Error("PenPal uploaded the file, but could not save its Drive delivery record. Retry safely to recover the link.");

    await recordAuditEvent(supabase, {
      editorId,
      entityId: artifact.id,
      entityType: "document_artifact",
      eventData: { fileId: uploaded.fileId, provider: "google_drive", url: uploaded.url },
      eventType: "revised_manuscript_uploaded_to_drive",
      manuscriptId,
    });
    return NextResponse.json({ fileId: uploaded.fileId, url: uploaded.url }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Drive could not save the revised Word copy.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
