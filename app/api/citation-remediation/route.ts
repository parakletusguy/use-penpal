import { NextResponse } from "next/server";
import { buildCitationRemediationPacket } from "@/lib/citations/remediation-plan";
import { createClient } from "@/utils/supabase/server";

type LatestRun = {
  attention_reference_count: number;
  citation_count: number;
  id: number;
  manuscript_id: number;
  reference_count: number;
  verified_reference_count: number;
};

export async function GET() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const editorId = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;
  const email = typeof claimsData?.claims?.email === "string" ? claimsData.claims.email.toLowerCase() : null;
  const allowedEmail = process.env.PENPAL_EDITOR_EMAIL?.trim().toLowerCase();
  if (claimsError || !editorId || !allowedEmail || email !== allowedEmail) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const [manuscriptsResult, runsResult] = await Promise.all([
    supabase.from("manuscripts").select("id, title, source_file_name").eq("editor_id", editorId).order("created_at"),
    supabase.from("citation_verification_runs").select("id, manuscript_id, reference_count, citation_count, verified_reference_count, attention_reference_count, created_at").eq("editor_id", editorId).order("created_at", { ascending: false }),
  ]);
  const manuscripts = manuscriptsResult.data ?? [];
  const latestRunByManuscript = new Map<number, LatestRun>();
  for (const run of runsResult.data ?? []) {
    if (!latestRunByManuscript.has(run.manuscript_id)) latestRunByManuscript.set(run.manuscript_id, run);
  }
  const runs = [...latestRunByManuscript.values()];
  const runIds = runs.map((run) => run.id);
  const [referencesResult, citationsResult] = runIds.length
    ? await Promise.all([
      supabase.from("reference_records").select("run_id, reference_order, raw_reference, verification_status, verification_reason, citation_count").eq("editor_id", editorId).in("run_id", runIds).order("reference_order"),
      supabase.from("citation_occurrences").select("run_id, citation_text, reconciliation_status, source_locator").eq("editor_id", editorId).in("run_id", runIds).order("id"),
    ])
    : [{ data: [] }, { data: [] }];

  const output = [
    "# PenPal citation remediation batch",
    "",
    "This batch worklist uses the latest verification run for each manuscript. It is not a source of replacement bibliography. Obtain an authoritative author-supplied source record, or an explicit editorial decision to revise or remove a dependent claim, before changing a manuscript.",
    "",
    ...manuscripts.map((manuscript) => {
      const run = latestRunByManuscript.get(manuscript.id);
      if (!run) return `## ${manuscript.title ?? manuscript.source_file_name}\n\nNo reference-verification run is available yet.\n`;
      return buildCitationRemediationPacket({
        attentionReferenceCount: run.attention_reference_count,
        citationCount: run.citation_count,
        citations: (citationsResult.data ?? []).filter((citation) => citation.run_id === run.id).map((citation) => ({ citationText: citation.citation_text, reconciliationStatus: citation.reconciliation_status, sourceLocator: citation.source_locator })),
        manuscriptTitle: manuscript.title ?? manuscript.source_file_name,
        referenceCount: run.reference_count,
        references: (referencesResult.data ?? []).filter((reference) => reference.run_id === run.id).map((reference) => ({ citationCount: reference.citation_count, rawReference: reference.raw_reference, referenceOrder: reference.reference_order, verificationReason: reference.verification_reason, verificationStatus: reference.verification_status })),
        verifiedReferenceCount: run.verified_reference_count,
      });
    }),
  ].join("\n\n---\n\n");

  return new NextResponse(output, {
    headers: {
      "Content-Disposition": "attachment; filename=\"penpal-citation-remediation-batch.md\"",
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
