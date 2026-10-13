import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit";
import { createCitationProposals } from "@/lib/ai/citation-proposals";
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
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "OpenAI has not been configured yet." }, { status: 503 });

  const [manuscriptResult, runResult, suggestionResult] = await Promise.all([
    supabase.from("manuscripts").select("id, consent_status").eq("id", manuscriptId).eq("editor_id", editorId).maybeSingle(),
    supabase.from("citation_verification_runs").select("id, reference_count").eq("manuscript_id", manuscriptId).eq("editor_id", editorId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("edit_suggestions").select("id").eq("manuscript_id", manuscriptId).eq("editor_id", editorId).eq("suggestion_type", "citation").in("suggestion_status", ["proposed", "approved", "applied", "modified"]),
  ]);
  const manuscript = manuscriptResult.data;
  const run = runResult.data;
  if (manuscriptResult.error || !manuscript) return NextResponse.json({ error: "Manuscript not found." }, { status: 404 });
  if (manuscript.consent_status !== "recorded") return NextResponse.json({ error: "Recorded consent is required before citation proposals." }, { status: 409 });
  if (!run) return NextResponse.json({ error: "Run reference verification before building citation proposals." }, { status: 409 });
  if (!run.reference_count) return NextResponse.json({ error: "PenPal could not parse any references in this manuscript. Repair the reference-list structure before requesting proposals." }, { status: 409 });
  if (suggestionResult.data?.length) return NextResponse.json({ created: 0, reused: true, total: suggestionResult.data.length }, { status: 200 });

  const { data: references, error: referencesError } = await supabase
    .from("reference_records")
    .select("id, reference_order, raw_reference, doi, first_author, publication_year, title, citation_count, source_locator")
    .eq("run_id", run.id)
    .eq("editor_id", editorId)
    .order("reference_order");
  if (referencesError || !references?.length) return NextResponse.json({ error: "PenPal could not load the parsed references." }, { status: 422 });

  try {
    const proposals = await createCitationProposals(references.map((reference) => ({
      citationCount: reference.citation_count,
      doi: reference.doi,
      firstAuthor: reference.first_author,
      order: reference.reference_order,
      publicationYear: reference.publication_year,
      rawReference: reference.raw_reference,
      referenceId: reference.id,
      sourceLocator: reference.source_locator as { line: number },
      title: reference.title,
    })));
    if (!proposals.length) return NextResponse.json({ created: 0, message: "PenPal found no source-backed candidate it could safely propose. The remediation worklist remains the next action." }, { status: 200 });

    const { error: insertError } = await supabase.from("edit_suggestions").insert(proposals.map((proposal) => ({
      editor_id: editorId,
      manuscript_id: manuscriptId,
      original_text: proposal.sourceReference,
      proposed_text: proposal.formattedReference,
      rationale: `${proposal.autoApplyEligible ? "High-confidence source match; editor approval is still required before it is placed in a Word copy." : "Source-backed candidate; editor approval is required."} ${proposal.rationale}`,
      source_locator: {
        candidate: proposal.candidate,
        citationProposal: true,
        modelConfidence: proposal.modelConfidence,
        referenceId: proposal.referenceId,
        referenceOrder: proposal.referenceOrder,
        verificationRunId: run.id,
      },
      suggestion_type: "citation",
    })));
    if (insertError) throw new Error("PenPal could not save the citation proposals.");

    const autoApplyEligible = proposals.filter((proposal) => proposal.autoApplyEligible).length;
    await recordAuditEvent(supabase, {
      editorId,
      entityId: run.id,
      entityType: "citation_proposal_run",
      eventData: { autoApplyEligible, proposalCount: proposals.length, referenceCount: references.length, verificationRunId: run.id },
      eventType: "citation_proposals_created",
      manuscriptId,
    });
    return NextResponse.json({ autoApplyEligible, created: proposals.length, total: proposals.length }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PenPal could not create citation proposals.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
