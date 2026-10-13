import mammoth from "mammoth";
import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit";
import { buildOrphanedBibliographyRemovals } from "@/lib/citations/orphaned-bibliography-removals";
import { buildUnsupportedClaimRemovals } from "@/lib/citations/unsupported-claim-removals";
import type { Json } from "@/types/database";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

function validId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function citationLocator(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const locator = value as Record<string, unknown>;
  return typeof locator.start === "number" && typeof locator.end === "number" ? { end: locator.end, start: locator.start } : null;
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
  if (claimsError || !editorId || !allowedEmail || email !== allowedEmail) return NextResponse.json({ error: "Not authorised." }, { status: 401 });

  const [manuscriptResult, runResult, existingResult] = await Promise.all([
    supabase.from("manuscripts").select("consent_status, original_storage_path").eq("id", manuscriptId).eq("editor_id", editorId).maybeSingle(),
    supabase.from("citation_verification_runs").select("id").eq("manuscript_id", manuscriptId).eq("editor_id", editorId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("edit_suggestions").select("id, original_text, source_locator, suggestion_type, suggestion_status").eq("manuscript_id", manuscriptId).eq("editor_id", editorId),
  ]);
  const manuscript = manuscriptResult.data;
  const run = runResult.data;
  if (manuscriptResult.error || !manuscript) return NextResponse.json({ error: "Manuscript not found." }, { status: 404 });
  if (manuscript.consent_status !== "recorded" || !manuscript.original_storage_path) return NextResponse.json({ error: "A consented private source copy is required." }, { status: 409 });
  if (!run) return NextResponse.json({ error: "Run citation verification first." }, { status: 409 });

  const [{ data: citations, error: citationsError }, { data: referenceRecords, error: referencesError }, { data: sourceFile, error: sourceError }] = await Promise.all([
    supabase.from("citation_occurrences").select("citation_text, reconciliation_status, source_locator, reference_id").eq("run_id", run.id).eq("editor_id", editorId),
    supabase.from("reference_records").select("id, doi, raw_reference, verification_status").eq("run_id", run.id).eq("editor_id", editorId),
    supabase.storage.from("penpal-manuscripts").download(manuscript.original_storage_path),
  ]);
  if (citationsError || referencesError || sourceError || !sourceFile) return NextResponse.json({ error: "PenPal could not read the citation evidence and private source copy." }, { status: 422 });

  const extracted = await mammoth.extractRawText({ buffer: Buffer.from(await sourceFile.arrayBuffer()) });
  const manuscriptText = extracted.value.replace(/\s+\n/g, "\n").trim();
  const existingOriginals = new Set((existingResult.data ?? []).map((item) => item.original_text?.replace(/\s+/g, " ").trim().toLowerCase()).filter(Boolean));
  const unresolvedCitations = (citations ?? []).filter((citation) => citation.reconciliation_status !== "matched");
  const removals = buildUnsupportedClaimRemovals(manuscriptText, unresolvedCitations.map((citation) => ({
    citationText: citation.citation_text,
    sourceLocator: citationLocator(citation.source_locator),
  }))).filter((removal) => !existingOriginals.has(removal.originalText.replace(/\s+/g, " ").trim().toLowerCase()));

  const removedCitationTexts = new Set<string>();
  for (const removal of removals) for (const citationText of removal.citationTexts) removedCitationTexts.add(citationText);
  for (const suggestion of existingResult.data ?? []) {
    if (suggestion.suggestion_type !== "citation") continue;
    const locator = suggestion.source_locator;
    if (!locator || typeof locator !== "object" || !Array.isArray((locator as Record<string, unknown>).citations)) continue;
    for (const citationText of (locator as Record<string, unknown>).citations as unknown[]) {
      if (typeof citationText === "string") removedCitationTexts.add(citationText);
    }
  }
  const bibliographyRemovals = buildOrphanedBibliographyRemovals(
    (referenceRecords ?? []).map((reference) => ({ doi: reference.doi, id: reference.id, rawReference: reference.raw_reference, verificationStatus: reference.verification_status })),
    (citations ?? []).map((citation) => ({ citationText: citation.citation_text, referenceId: citation.reference_id })),
    removedCitationTexts,
  ).filter((removal) => !existingOriginals.has(removal.originalText.replace(/\s+/g, " ").trim().toLowerCase()));

  if (removals.length) {
    const decidedAt = new Date().toISOString();
    const { error: insertError } = await supabase.from("edit_suggestions").insert(removals.map((removal) => ({
      decided_at: decidedAt,
      decided_by: editorId,
      decision_note: "Approved under the editor's instruction to remove unsupported citation-dependent claims from the separate revised copy.",
      editor_id: editorId,
      manuscript_id: manuscriptId,
      original_text: removal.originalText,
      proposed_text: "",
      rationale: "No authoritative source record could be recovered for the cited claim. The complete citation-dependent sentence is removed rather than retained without support.",
      source_locator: { citationRemoval: true, citations: removal.citationTexts, locations: removal.sourceLocators } as Json,
      suggestion_status: "approved",
      suggestion_type: "citation",
    })));
    if (insertError) return NextResponse.json({ error: "PenPal could not record the approved unsupported-claim removals." }, { status: 422 });
  }

  if (bibliographyRemovals.length) {
    const decidedAt = new Date().toISOString();
    const { error: insertError } = await supabase.from("edit_suggestions").insert(bibliographyRemovals.map((removal) => ({
      decided_at: decidedAt,
      decided_by: editorId,
      decision_note: "Approved under the editor's instruction to remove an orphaned DOI-bearing reference after its unsupported dependent claim was removed from the separate revised copy.",
      editor_id: editorId,
      manuscript_id: manuscriptId,
      original_text: removal.originalText,
      proposed_text: "",
      rationale: "The supplied DOI could not support this reference, and every parser-linked citation was already removed from the revised manuscript. Sources without a DOI are retained for editorial review.",
      source_locator: { bibliographyRemoval: true, referenceId: removal.referenceId } as Json,
      suggestion_status: "approved",
      suggestion_type: "citation",
    })));
    if (insertError) return NextResponse.json({ error: "PenPal could not record the approved bibliography cleanup." }, { status: 422 });
  }

  const proposedCitationIds = (existingResult.data ?? []).filter((item) => item.suggestion_type === "citation" && item.suggestion_status === "proposed").map((item) => item.id);
  if (proposedCitationIds.length) {
    await supabase.from("edit_suggestions").update({
      decided_at: new Date().toISOString(),
      decided_by: editorId,
      decision_note: "Superseded by the approved removal of the unsupported citation-dependent claim.",
      suggestion_status: "rejected",
    }).in("id", proposedCitationIds).eq("editor_id", editorId);
  }

  await recordAuditEvent(supabase, {
    editorId,
    entityId: run.id,
    entityType: "unsupported_citation_remediation",
    eventData: { removedClaimCount: removals.length, removedReferenceCount: bibliographyRemovals.length, unresolvedCitationCount: unresolvedCitations.length },
    eventType: "unsupported_citation_claims_removed",
    manuscriptId,
  });
  return NextResponse.json({ created: removals.length + bibliographyRemovals.length, removedClaims: removals.length, removedReferences: bibliographyRemovals.length, unresolvedCitations: unresolvedCitations.length }, { status: 201 });
}
