import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

type ChecklistRow = {
  action: string;
  evidence: string;
  item: string;
  status: "complete" | "editor_review" | "not_ready";
};

function validId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function cell(value: string) {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll("\"", "\"\"")}"`;
}

function csv(rows: ChecklistRow[]) {
  return [
    ["Item", "Status", "Evidence", "Editor action"],
    ...rows.map((row) => [row.item, row.status, row.evidence, row.action]),
  ].map((row) => row.map(cell).join(",")).join("\r\n");
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

  const [manuscriptResult, reportResult, findingsResult, suggestionsResult, artifactResult, citationRunResult, citationAttentionResult] = await Promise.all([
    supabase.from("manuscripts").select("source_file_name, original_storage_path").eq("id", manuscriptId).eq("editor_id", editorId).maybeSingle(),
    supabase.from("review_reports").select("id").eq("manuscript_id", manuscriptId).eq("editor_id", editorId).maybeSingle(),
    supabase.from("findings").select("id, severity, finding_status").eq("manuscript_id", manuscriptId).eq("editor_id", editorId),
    supabase.from("edit_suggestions").select("id, suggestion_type, suggestion_status").eq("manuscript_id", manuscriptId).eq("editor_id", editorId),
    supabase.from("document_artifacts").select("id, external_url").eq("manuscript_id", manuscriptId).eq("editor_id", editorId).eq("artifact_type", "revised_manuscript").order("generated_from_version", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("citation_verification_runs").select("id, run_status, reference_count, verified_reference_count, attention_reference_count").eq("manuscript_id", manuscriptId).eq("editor_id", editorId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("citation_occurrences").select("id", { count: "exact", head: true }).eq("manuscript_id", manuscriptId).eq("editor_id", editorId).in("reconciliation_status", ["ambiguous", "missing_reference", "manual_review"]),
  ]);
  const manuscript = manuscriptResult.data;
  if (manuscriptResult.error || !manuscript) return NextResponse.json({ error: "Manuscript not found." }, { status: 404 });

  const findings = findingsResult.data ?? [];
  const suggestions = suggestionsResult.data ?? [];
  const unresolvedTechnicalCount = findings.filter((finding) => finding.finding_status === "open" && ["blocking", "high"].includes(finding.severity)).length;
  const proposedCount = suggestions.filter((suggestion) => suggestion.suggestion_status === "proposed").length;
  const authorQueryCount = suggestions.filter((suggestion) => suggestion.suggestion_type === "author_query" && suggestion.suggestion_status !== "rejected").length;
  const citationRun = citationRunResult.data;
  const citationAttentionCount = citationAttentionResult.count ?? 0;
  const rows: ChecklistRow[] = [
    {
      action: manuscript.original_storage_path ? "No action required." : "Add a private .docx source copy.",
      evidence: manuscript.original_storage_path ? "Private source copy recorded." : "No private source copy recorded.",
      item: "Private source copy",
      status: manuscript.original_storage_path ? "complete" : "not_ready",
    },
    {
      action: reportResult.data ? "Review the evidence-backed findings." : "Run the editorial review.",
      evidence: reportResult.data ? "Editorial report recorded." : "No editorial report recorded.",
      item: "Editorial review",
      status: reportResult.data ? "complete" : "not_ready",
    },
    {
      action: citationRun ? "Review any reference and citation items marked for attention." : "Run reference verification.",
      evidence: citationRun ? `${citationRun.verified_reference_count} of ${citationRun.reference_count} references verified; ${citationRun.attention_reference_count} reference item(s) need attention.` : "No reference-verification run recorded.",
      item: "Reference verification",
      status: !citationRun ? "not_ready" : citationRun.run_status === "complete" && !citationRun.attention_reference_count ? "complete" : "editor_review",
    },
    {
      action: citationAttentionCount ? "Resolve or query the author about each cited work before submission." : "No action required.",
      evidence: citationAttentionCount ? `${citationAttentionCount} in-text citation reconciliation item(s) remain.` : "No unresolved in-text citation reconciliation items recorded.",
      item: "In-text citation reconciliation",
      status: citationAttentionCount ? "editor_review" : "complete",
    },
    {
      action: unresolvedTechnicalCount ? "Resolve or consciously retain each high/blocking preparation finding." : "No high/blocking open preparation findings recorded.",
      evidence: `${unresolvedTechnicalCount} high/blocking open finding(s).`,
      item: "IJSDS technical preparation",
      status: unresolvedTechnicalCount ? "editor_review" : "complete",
    },
    {
      action: proposedCount ? "Record an approval or rejection for every proposed edit." : "All proposed edits have an editor decision.",
      evidence: `${proposedCount} proposed edit(s) awaiting a decision.`,
      item: "Editor decisions",
      status: proposedCount ? "not_ready" : "complete",
    },
    {
      action: authorQueryCount ? "Send and resolve the author queries outside PenPal; do not insert them into the manuscript automatically." : "No outstanding author queries recorded.",
      evidence: `${authorQueryCount} author query item(s) retained in the editorial record.`,
      item: "Author queries",
      status: authorQueryCount ? "editor_review" : "complete",
    },
    {
      action: artifactResult.data ? "Open and inspect the separate revised .docx before submission." : "Create a revised Word copy from approved edits.",
      evidence: artifactResult.data ? "Revised Word copy recorded." : "No revised Word copy recorded.",
      item: "Revised Word copy",
      status: artifactResult.data ? "complete" : "not_ready",
    },
    {
      action: artifactResult.data?.external_url ? "No action required." : "Optional: upload the revised copy to the configured Drive output folder.",
      evidence: artifactResult.data?.external_url ? "Drive delivery recorded." : "No Drive delivery recorded.",
      item: "Drive delivery",
      status: artifactResult.data?.external_url ? "complete" : "editor_review",
    },
  ];

  const fileStem = manuscript.source_file_name.replace(/\.docx$/i, "").replace(/[^a-zA-Z0-9._-]/g, "_") || `manuscript-${manuscriptId}`;
  return new NextResponse(csv(rows), {
    headers: {
      "Content-Disposition": `attachment; filename=\"${fileStem}-penpal-submission-checklist.csv\"`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
