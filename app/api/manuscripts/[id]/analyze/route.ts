import mammoth from "mammoth";
import { after, NextResponse } from "next/server";
import { createEditorialReview } from "@/lib/ai/editorial-review";
import { sendReviewFailedAlert, sendReviewReadyAlert } from "@/lib/email/editorial-alerts";
import { createClient } from "@/utils/supabase/server";

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

  if (!editorId || !allowedEmail || email !== allowedEmail) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OpenAI has not been configured yet." }, { status: 503 });
  }

  const { data: manuscript, error: manuscriptError } = await supabase
    .from("manuscripts")
    .select("id, title, consent_status, original_storage_path")
    .eq("id", manuscriptId)
    .maybeSingle();

  if (manuscriptError || !manuscript) return NextResponse.json({ error: "Manuscript not found." }, { status: 404 });
  if (manuscript.consent_status !== "recorded") return NextResponse.json({ error: "Recorded consent is required before analysis." }, { status: 409 });
  if (!manuscript.original_storage_path) return NextResponse.json({ error: "Add a private .docx source copy before analysis." }, { status: 409 });
  const manuscriptTitle = manuscript.title || "Untitled manuscript";

  const { data: existingReport } = await supabase
    .from("review_reports")
    .select("id")
    .eq("manuscript_id", manuscriptId)
    .maybeSingle();
  if (existingReport) return NextResponse.json({ error: "This manuscript already has a review report." }, { status: 409 });

  const { data: sourceFile, error: sourceError } = await supabase.storage
    .from("penpal-manuscripts")
    .download(manuscript.original_storage_path);
  if (sourceError || !sourceFile) return NextResponse.json({ error: "The private source copy could not be read." }, { status: 409 });

  const extraction = await mammoth.extractRawText({ buffer: Buffer.from(await sourceFile.arrayBuffer()) });
  const manuscriptText = extraction.value.replace(/\s+\n/g, "\n").trim();
  if (manuscriptText.length < 300) return NextResponse.json({ error: "PenPal could not extract enough text from this document." }, { status: 422 });

  const startedAt = new Date().toISOString();
  await supabase.from("manuscripts").update({ analysis_started_at: startedAt, workflow_status: "checking" }).eq("id", manuscriptId);

  try {
    const review = await createEditorialReview(manuscriptText);
    const finishedAt = new Date().toISOString();
    const { error: reportError } = await supabase.from("review_reports").insert({
      editor_id: editorId,
      generated_at: finishedAt,
      manuscript_id: manuscriptId,
      model_provider: "gemini",
      report_content: { findingCount: review.findings.length, suggestionCount: review.suggestions.length },
      report_status: "final",
      rubric_version: "ijsds-editorial-v1",
      summary: review.summary,
    });
    if (reportError) throw new Error("PenPal could not save the review report.");

    if (review.findings.length) {
      const { error } = await supabase.from("findings").insert(review.findings.map((finding) => ({
        description: finding.description,
        editor_id: editorId,
        evidence_excerpt: finding.evidenceExcerpt,
        finding_type: finding.findingType,
        manuscript_id: manuscriptId,
        recommended_action: finding.recommendedAction,
        requires_editor_decision: finding.requiresEditorDecision,
        severity: finding.severity,
        source_locator: { excerpt: finding.evidenceExcerpt },
        title: finding.title,
      })));
      if (error) throw new Error("PenPal could not save the findings.");
    }

    if (review.suggestions.length) {
      const { error } = await supabase.from("edit_suggestions").insert(review.suggestions.map((suggestion) => ({
        editor_id: editorId,
        manuscript_id: manuscriptId,
        original_text: suggestion.originalText,
        proposed_text: suggestion.proposedText,
        rationale: suggestion.rationale,
        source_locator: { excerpt: suggestion.originalText },
        suggestion_type: suggestion.suggestionType,
      })));
      if (error) throw new Error("PenPal could not save the edit suggestions.");
    }

    await supabase.from("manuscripts").update({ analysis_completed_at: finishedAt, workflow_status: "ready_to_edit" }).eq("id", manuscriptId);
    after(() => sendReviewReadyAlert({
      findingCount: review.findings.length,
      manuscriptId,
      suggestionCount: review.suggestions.length,
      title: manuscriptTitle,
    }));
    return NextResponse.json({ findings: review.findings.length, suggestions: review.suggestions.length }, { status: 201 });
  } catch (error) {
    await supabase.from("manuscripts").update({ workflow_status: "ready_to_review" }).eq("id", manuscriptId);
    after(() => sendReviewFailedAlert({ manuscriptId, title: manuscriptTitle }));
    const message = error instanceof Error ? error.message : "PenPal could not complete the review.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
