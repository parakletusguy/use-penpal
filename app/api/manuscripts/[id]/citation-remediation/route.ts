import { NextResponse } from "next/server";
import { buildCitationRemediationPacket } from "@/lib/citations/remediation-plan";
import { createClient } from "@/utils/supabase/server";

function validId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function fileName(value: string, manuscriptId: number) {
  const stem = value.replace(/\.docx$/i, "").replace(/[^a-zA-Z0-9._-]/g, "_") || `manuscript-${manuscriptId}`;
  return `${stem}-penpal-citation-remediation.md`;
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

  const [manuscriptResult, runResult] = await Promise.all([
    supabase.from("manuscripts").select("id, title, source_file_name").eq("id", manuscriptId).eq("editor_id", editorId).maybeSingle(),
    supabase.from("citation_verification_runs").select("id, reference_count, citation_count, verified_reference_count, attention_reference_count").eq("manuscript_id", manuscriptId).eq("editor_id", editorId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const manuscript = manuscriptResult.data;
  const run = runResult.data;
  if (manuscriptResult.error || !manuscript) return NextResponse.json({ error: "Manuscript not found." }, { status: 404 });
  if (!run) return NextResponse.json({ error: "Run reference verification before downloading a remediation packet." }, { status: 409 });

  const [referencesResult, citationsResult] = await Promise.all([
    supabase.from("reference_records").select("reference_order, raw_reference, verification_status, verification_reason, citation_count").eq("run_id", run.id).eq("editor_id", editorId).order("reference_order"),
    supabase.from("citation_occurrences").select("citation_text, reconciliation_status, source_locator").eq("run_id", run.id).eq("editor_id", editorId).order("id"),
  ]);

  const output = buildCitationRemediationPacket({
    attentionReferenceCount: run.attention_reference_count,
    citationCount: run.citation_count,
    citations: (citationsResult.data ?? []).map((citation) => ({ citationText: citation.citation_text, reconciliationStatus: citation.reconciliation_status, sourceLocator: citation.source_locator })),
    manuscriptTitle: manuscript.title ?? manuscript.source_file_name,
    referenceCount: run.reference_count,
    references: (referencesResult.data ?? []).map((reference) => ({ citationCount: reference.citation_count, rawReference: reference.raw_reference, referenceOrder: reference.reference_order, verificationReason: reference.verification_reason, verificationStatus: reference.verification_status })),
    verifiedReferenceCount: run.verified_reference_count,
  });

  return new NextResponse(output, {
    headers: {
      "Content-Disposition": `attachment; filename=\"${fileName(manuscript.source_file_name, manuscriptId)}\"`,
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
