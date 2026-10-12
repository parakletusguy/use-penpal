import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createRevisedDocument, revisedFileName } from "@/lib/docx/revise-manuscript";
import { createClient } from "@/utils/supabase/server";

const WORD_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function validId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function revisionStoragePath(editorId: string, manuscriptId: number, version: number, name: string) {
  return `${editorId}/${manuscriptId}/revisions/v${version}/${name}`;
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

  const { data: manuscript, error: manuscriptError } = await supabase
    .from("manuscripts")
    .select("id, source_file_name, original_storage_path, current_edit_version, workflow_status")
    .eq("id", manuscriptId)
    .eq("editor_id", editorId)
    .maybeSingle();
  if (manuscriptError || !manuscript) return NextResponse.json({ error: "Manuscript not found." }, { status: 404 });
  if (!manuscript.original_storage_path) return NextResponse.json({ error: "A private source copy is required before edits can be applied." }, { status: 409 });

  const { data: existingRevision } = await supabase
    .from("document_artifacts")
    .select("display_name, storage_path")
    .eq("manuscript_id", manuscriptId)
    .eq("editor_id", editorId)
    .eq("artifact_type", "revised_manuscript")
    .order("generated_from_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingRevision && manuscript.workflow_status === "exported") {
    return NextResponse.json({
      applied: 0,
      authorQueries: 0,
      reused: true,
      revisedName: existingRevision.display_name,
      skipped: 0,
    });
  }

  const decidedAt = new Date().toISOString();
  const standardDecision = await supabase
    .from("edit_suggestions")
    .update({ decided_at: decidedAt, decided_by: editorId, suggestion_status: "approved" })
    .eq("manuscript_id", manuscriptId)
    .eq("editor_id", editorId)
    .eq("suggestion_status", "proposed")
    .neq("suggestion_type", "author_query");
  if (standardDecision.error) return NextResponse.json({ error: "PenPal could not record the editorial decisions." }, { status: 422 });

  const queryDecision = await supabase
    .from("edit_suggestions")
    .update({
      decided_at: decidedAt,
      decided_by: editorId,
      decision_note: "Accepted as an editorial query. It remains in the review report and is not inserted as manuscript text.",
      suggestion_status: "approved",
    })
    .eq("manuscript_id", manuscriptId)
    .eq("editor_id", editorId)
    .eq("suggestion_status", "proposed")
    .eq("suggestion_type", "author_query");
  if (queryDecision.error) return NextResponse.json({ error: "PenPal could not record the author queries." }, { status: 422 });

  const { data: approvedSuggestions, error: suggestionsError } = await supabase
    .from("edit_suggestions")
    .select("id, original_text, proposed_text, suggestion_type")
    .eq("manuscript_id", manuscriptId)
    .eq("editor_id", editorId)
    .eq("suggestion_status", "approved")
    .order("created_at");
  if (suggestionsError) return NextResponse.json({ error: "PenPal could not load the approved edits." }, { status: 422 });

  const authorQueries = (approvedSuggestions ?? []).filter((suggestion) => suggestion.suggestion_type === "author_query");
  const mechanicalEdits = (approvedSuggestions ?? [])
    .filter((suggestion) => suggestion.suggestion_type !== "author_query")
    .map((suggestion) => ({ id: suggestion.id, originalText: suggestion.original_text, proposedText: suggestion.proposed_text }));

  const { data: sourceFile, error: sourceError } = await supabase.storage
    .from("penpal-manuscripts")
    .download(manuscript.original_storage_path);
  if (sourceError || !sourceFile) return NextResponse.json({ error: "The private source copy could not be read." }, { status: 409 });

  let revision;
  try {
    revision = await createRevisedDocument(Buffer.from(await sourceFile.arrayBuffer()), mechanicalEdits);
  } catch {
    return NextResponse.json({ error: "PenPal could not create a safe revised Word copy." }, { status: 422 });
  }

  const nextVersion = manuscript.current_edit_version + 1;
  const revisedName = revisedFileName(manuscript.source_file_name);
  const storagePath = revisionStoragePath(editorId, manuscriptId, nextVersion, revisedName);
  const { error: uploadError } = await supabase.storage
    .from("penpal-manuscripts")
    .upload(storagePath, revision.bytes, { contentType: WORD_MIME, upsert: false });
  if (uploadError) return NextResponse.json({ error: "PenPal could not save the revised Word copy." }, { status: 422 });

  const { error: artifactError } = await supabase.from("document_artifacts").insert({
    artifact_type: "revised_manuscript",
    byte_size: revision.bytes.byteLength,
    checksum: createHash("sha256").update(revision.bytes).digest("hex"),
    content_type: WORD_MIME,
    created_by: editorId,
    display_name: revisedName,
    editor_id: editorId,
    generated_from_version: nextVersion,
    manuscript_id: manuscriptId,
    storage_path: storagePath,
  });
  if (artifactError) return NextResponse.json({ error: "PenPal could not register the revised Word copy." }, { status: 422 });

  if (revision.appliedSuggestionIds.length) {
    const { error: applyError } = await supabase
      .from("edit_suggestions")
      .update({ applied_in_version: nextVersion, suggestion_status: "applied" })
      .eq("manuscript_id", manuscriptId)
      .eq("editor_id", editorId)
      .in("id", revision.appliedSuggestionIds);
    if (applyError) return NextResponse.json({ error: "The revised copy is ready, but PenPal could not mark every applied edit." }, { status: 422 });
  }

  const { error: manuscriptUpdateError } = await supabase
    .from("manuscripts")
    .update({ current_edit_version: nextVersion, workflow_status: "exported" })
    .eq("id", manuscriptId)
    .eq("editor_id", editorId);
  if (manuscriptUpdateError) return NextResponse.json({ error: "The revised copy is ready, but PenPal could not complete its workflow record." }, { status: 422 });

  return NextResponse.json({
    applied: revision.appliedSuggestionIds.length,
    authorQueries: authorQueries.length,
    revisedName,
    skipped: revision.skippedEdits.length,
    skippedEdits: revision.skippedEdits,
  }, { status: 201 });
}
