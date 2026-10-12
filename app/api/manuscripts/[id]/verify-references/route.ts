import { createHash } from "node:crypto";
import mammoth from "mammoth";
import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit";
import { verifyManuscriptReferences } from "@/lib/citations/verify-references";
import type { Json } from "@/types/database";
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
  const { data: claimsData } = await supabase.auth.getClaims();
  const editorId = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;
  const email = typeof claimsData?.claims?.email === "string" ? claimsData.claims.email.toLowerCase() : null;
  const allowedEmail = process.env.PENPAL_EDITOR_EMAIL?.trim().toLowerCase();
  if (!editorId || !allowedEmail || email !== allowedEmail) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const { data: manuscript, error: manuscriptError } = await supabase
    .from("manuscripts")
    .select("id, consent_status, original_storage_path")
    .eq("id", manuscriptId)
    .eq("editor_id", editorId)
    .maybeSingle();
  if (manuscriptError || !manuscript) return NextResponse.json({ error: "Manuscript not found." }, { status: 404 });
  if (manuscript.consent_status !== "recorded") {
    return NextResponse.json({ error: "Recorded consent is required before reference verification." }, { status: 409 });
  }
  if (!manuscript.original_storage_path) {
    return NextResponse.json({ error: "Add a private .docx source copy before verifying references." }, { status: 409 });
  }

  const { data: sourceFile, error: sourceError } = await supabase.storage
    .from("penpal-manuscripts")
    .download(manuscript.original_storage_path);
  if (sourceError || !sourceFile) return NextResponse.json({ error: "The private source copy could not be read." }, { status: 409 });

  const sourceBuffer = Buffer.from(await sourceFile.arrayBuffer());
  const extraction = await mammoth.extractRawText({ buffer: sourceBuffer });
  const manuscriptText = extraction.value.replace(/\s+\n/g, "\n").trim();
  if (manuscriptText.length < 300) {
    return NextResponse.json({ error: "PenPal could not extract enough text from this document." }, { status: 422 });
  }

  const sourceChecksum = createHash("sha256").update(sourceBuffer).digest("hex");
  const { data: run, error: runError } = await supabase
    .from("citation_verification_runs")
    .insert({
      editor_id: editorId,
      manuscript_id: manuscriptId,
      profile_version: "ijsds-citation-v1",
      run_status: "running",
      source_checksum: sourceChecksum,
    })
    .select("id")
    .single();
  if (runError || !run) return NextResponse.json({ error: "PenPal could not start reference verification." }, { status: 422 });

  try {
    const result = await verifyManuscriptReferences(manuscriptText);
    let storedReferences: Array<{ id: number; reference_order: number }> = [];
    if (result.references.length) {
      const { data, error } = await supabase
        .from("reference_records")
        .insert(result.references.map((reference) => ({
          citation_count: reference.citationCount,
          doi: reference.doi,
          editor_id: editorId,
          first_author: reference.firstAuthor,
          manuscript_id: manuscriptId,
          parsed_metadata: {
            firstAuthor: reference.firstAuthor,
            publicationYear: reference.publicationYear,
            title: reference.title,
          },
          publication_year: reference.publicationYear,
          raw_reference: reference.rawReference,
          reference_order: reference.order,
          run_id: run.id,
          source_locator: reference.sourceLocator,
          title: reference.title,
          verification_reason: reference.verificationReason,
          verification_status: reference.verificationStatus,
        })))
        .select("id, reference_order");
      if (error) throw new Error("PenPal could not save the parsed references.");
      storedReferences = data ?? [];
    }

    const referenceIdByOrder = new Map((storedReferences ?? []).map((reference) => [reference.reference_order, reference.id]));
    if (result.verifications.length) {
      const verificationRows = result.verifications.map((verification) => {
        const referenceId = referenceIdByOrder.get(verification.referenceOrder);
        if (!referenceId) throw new Error("PenPal could not connect a verification to its reference.");
        return {
          confidence: verification.confidence,
          editor_id: editorId,
          lookup_type: verification.lookupType,
          manuscript_id: manuscriptId,
          matched_fields: verification.matchedFields as Json,
          provider: verification.provider,
          provider_url: verification.providerUrl,
          provider_work_id: verification.providerWorkId,
          received_metadata: verification.receivedMetadata as Json,
          reference_id: referenceId,
          request_fingerprint: verification.requestFingerprint,
          run_id: run.id,
          verification_status: verification.status,
        };
      });
      const { error } = await supabase.from("reference_verifications").insert(verificationRows);
      if (error) throw new Error("PenPal could not save the live metadata verification results.");
    }

    if (result.citations.length) {
      const { error } = await supabase.from("citation_occurrences").insert(result.citations.map((citation) => ({
        cited_author: citation.citedAuthor,
        cited_year: citation.citedYear,
        citation_text: citation.citationText,
        editor_id: editorId,
        manuscript_id: manuscriptId,
        reconciliation_status: citation.reconciliationStatus,
        reference_id: citation.referenceOrder ? referenceIdByOrder.get(citation.referenceOrder) ?? null : null,
        run_id: run.id,
        source_locator: citation.sourceLocator,
      })));
      if (error) throw new Error("PenPal could not save the in-text citation checks.");
    }

    const verifiedCount = result.references.filter((reference) => reference.verificationStatus === "verified").length;
    const attentionCount = result.references.length - verifiedCount;
    const runStatus = result.references.length && !attentionCount ? "complete" : "partial";
    const { error: completionError } = await supabase
      .from("citation_verification_runs")
      .update({
        attention_reference_count: attentionCount,
        citation_count: result.citations.length,
        completed_at: new Date().toISOString(),
        reference_count: result.references.length,
        run_status: runStatus,
        verified_reference_count: verifiedCount,
      })
      .eq("id", run.id)
      .eq("editor_id", editorId);
    if (completionError) throw new Error("PenPal could not finish the reference-verification record.");

    await recordAuditEvent(supabase, {
      editorId,
      entityId: run.id,
      entityType: "citation_verification_run",
      eventData: {
        attentionReferenceCount: attentionCount,
        citationCount: result.citations.length,
        profileVersion: "ijsds-citation-v1",
        referenceCount: result.references.length,
        verifiedReferenceCount: verifiedCount,
      },
      eventType: "citation_verification_completed",
      manuscriptId,
    });

    return NextResponse.json({
      attentionReferences: attentionCount,
      citations: result.citations.length,
      references: result.references.length,
      runId: run.id,
      verifiedReferences: verifiedCount,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PenPal could not verify the manuscript references.";
    await supabase
      .from("citation_verification_runs")
      .update({ completed_at: new Date().toISOString(), error_summary: message, run_status: "failed" })
      .eq("id", run.id)
      .eq("editor_id", editorId);
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
