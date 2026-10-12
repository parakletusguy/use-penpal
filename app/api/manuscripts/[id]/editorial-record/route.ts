import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

function validId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function recordFileName(manuscriptId: number) {
  return `penpal-editorial-record-${manuscriptId}.json`;
}

export async function GET(
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
    .select("id, title, source_file_name, source_checksum, consent_recorded_at, workflow_status, current_edit_version")
    .eq("id", manuscriptId)
    .eq("editor_id", editorId)
    .maybeSingle();
  if (manuscriptError || !manuscript) return NextResponse.json({ error: "Manuscript not found." }, { status: 404 });

  const [reportResult, findingsResult, suggestionsResult, artifactsResult, auditResult, citationRunsResult] = await Promise.all([
    supabase.from("review_reports").select("summary, generated_at, finalised_at, model_provider, rubric_version, report_content").eq("manuscript_id", manuscriptId).eq("editor_id", editorId).maybeSingle(),
    supabase.from("findings").select("id, finding_type, severity, title, description, evidence_excerpt, recommended_action, requires_editor_decision, finding_status, created_at").eq("manuscript_id", manuscriptId).eq("editor_id", editorId).order("created_at"),
    supabase.from("edit_suggestions").select("id, suggestion_type, suggestion_status, original_text, proposed_text, rationale, decision_note, decided_at, applied_in_version, created_at").eq("manuscript_id", manuscriptId).eq("editor_id", editorId).order("created_at"),
    supabase.from("document_artifacts").select("id, artifact_type, display_name, content_type, checksum, byte_size, generated_from_version, storage_path, external_provider, external_file_id, external_url, externally_delivered_at, created_at").eq("manuscript_id", manuscriptId).eq("editor_id", editorId).order("created_at"),
    supabase.from("audit_events").select("id, event_type, entity_type, entity_id, event_data, created_at").eq("manuscript_id", manuscriptId).eq("editor_id", editorId).order("created_at"),
    supabase.from("citation_verification_runs").select("id, profile_version, run_status, source_checksum, reference_count, citation_count, verified_reference_count, attention_reference_count, completed_at, error_summary, created_at").eq("manuscript_id", manuscriptId).eq("editor_id", editorId).order("created_at", { ascending: false }),
  ]);
  const citationRuns = citationRunsResult.data ?? [];
  const runIds = citationRuns.map((run) => run.id);
  const [referencesResult, occurrencesResult, verificationsResult] = runIds.length
    ? await Promise.all([
      supabase.from("reference_records").select("run_id, reference_order, raw_reference, doi, first_author, publication_year, title, verification_status, verification_reason, citation_count").in("run_id", runIds).eq("editor_id", editorId).order("reference_order"),
      supabase.from("citation_occurrences").select("run_id, citation_text, cited_author, cited_year, reconciliation_status, source_locator").in("run_id", runIds).eq("editor_id", editorId).order("id"),
      supabase.from("reference_verifications").select("run_id, reference_id, provider, provider_work_id, provider_url, lookup_type, confidence, verification_status, matched_fields, received_metadata, checked_at").in("run_id", runIds).eq("editor_id", editorId).order("id"),
    ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const record = {
    generatedAt: new Date().toISOString(),
    recordVersion: "penpal-editorial-record-v1",
    manuscript,
    reviewReport: reportResult.data,
    findings: findingsResult.data ?? [],
    suggestions: suggestionsResult.data ?? [],
    artifacts: artifactsResult.data ?? [],
    citationVerificationRuns: citationRuns.map((run) => ({
      run,
      references: (referencesResult.data ?? []).filter((reference) => reference.run_id === run.id),
      citationOccurrences: (occurrencesResult.data ?? []).filter((occurrence) => occurrence.run_id === run.id),
      providerResults: (verificationsResult.data ?? []).filter((verification) => verification.run_id === run.id),
    })),
    auditEvents: auditResult.data ?? [],
  };

  return new NextResponse(JSON.stringify(record, null, 2), {
    headers: {
      "Content-Disposition": `attachment; filename=\"${recordFileName(manuscriptId)}\"`,
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
