import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandName } from "@/components/brand-name";
import { decideSuggestion } from "@/app/manuscripts/[id]/actions";
import { FinalizeManuscriptButton } from "@/app/manuscripts/[id]/finalize-manuscript-button";
import { RunAnalysisButton } from "@/app/manuscripts/[id]/run-analysis-button";
import { SourceUpload } from "@/app/manuscripts/[id]/source-upload";
import { driveFileUrl } from "@/lib/initial-ijsds-batch";
import { requireEditor } from "@/lib/editor-access";

function validId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function labelFromStatus(status: string) {
  return status.replaceAll("_", " ");
}

export default async function ManuscriptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const manuscriptId = validId(rawId);
  if (!manuscriptId) notFound();

  const { supabase } = await requireEditor();
  const [manuscriptResult, findingsResult, suggestionsResult, reportResult, artifactsResult] = await Promise.all([
    supabase.from("manuscripts").select("id, title, source_file_id, source_file_name, workflow_status, consent_status, original_storage_path, updated_at").eq("id", manuscriptId).maybeSingle(),
    supabase.from("findings").select("id, severity, title, description, evidence_excerpt, recommended_action, requires_editor_decision, finding_status").eq("manuscript_id", manuscriptId).order("created_at"),
    supabase.from("edit_suggestions").select("id, suggestion_type, suggestion_status, original_text, proposed_text, rationale").eq("manuscript_id", manuscriptId).order("created_at"),
    supabase.from("review_reports").select("summary, generated_at").eq("manuscript_id", manuscriptId).maybeSingle(),
    supabase.from("document_artifacts").select("display_name, storage_path, generated_from_version").eq("manuscript_id", manuscriptId).eq("artifact_type", "revised_manuscript").order("generated_from_version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const manuscript = manuscriptResult.data;
  if (!manuscript) notFound();
  const findings = findingsResult.data ?? [];
  const suggestions = suggestionsResult.data ?? [];
  const report = reportResult.data;
  const sourceReady = Boolean(manuscript.original_storage_path);
  const revisedArtifact = artifactsResult.data;
  const { data: revisedDownload } = revisedArtifact
    ? await supabase.storage.from("penpal-manuscripts").createSignedUrl(revisedArtifact.storage_path, 60 * 60)
    : { data: null };
  const proposedCount = suggestions.filter((item) => item.suggestion_status === "proposed").length;
  const appliedCount = suggestions.filter((item) => item.suggestion_status === "applied").length;
  const authorQueryCount = suggestions.filter((item) => item.suggestion_type === "author_query" && ["approved", "applied"].includes(item.suggestion_status)).length;

  return (
    <main className="workspace-shell">
      <nav className="workspace-nav" aria-label="Primary navigation">
        <Link className="brand" href="/"><BrandName /></Link>
        <div className="nav-links"><Link href="/">Overview</Link><Link href="/manuscripts">Manuscripts</Link></div>
        <form action="/auth/signout" method="post"><button className="text-button" type="submit">Sign out</button></form>
      </nav>
      <Link className="back-link" href="/manuscripts">← All manuscripts</Link>

      <header className="manuscript-header">
        <div>
          <p className="eyebrow">Manuscript workspace</p>
          <h1>{manuscript.title ?? manuscript.source_file_name}</h1>
          <a className="drive-link" href={driveFileUrl(manuscript.source_file_id)} rel="noreferrer" target="_blank">Open unchanged Drive original ↗</a>
        </div>
        <div className="status-stack"><span className="status"><i />{labelFromStatus(manuscript.workflow_status)}</span><span className="status status-muted">Consent recorded</span></div>
      </header>

      <section className="source-card" aria-labelledby="source-heading">
        <div>
          <p className="eyebrow">Step 1 · Source preparation</p>
          <h2 id="source-heading">{sourceReady ? "Private source copy is ready." : "Add the source PenPal should analyse."}</h2>
          <p>{sourceReady ? "This private copy is separate from Google Drive. PenPal will read it to create the report and proposed edits." : "Download the unchanged original from Drive, then add its .docx copy here. It is stored privately and the Drive source is never altered."}</p>
        </div>
        {sourceReady ? <span className="source-ready">Ready for analysis</span> : <SourceUpload manuscriptId={manuscript.id} />}
      </section>

      <section className="review-card" aria-labelledby="review-heading">
        <div>
          <p className="eyebrow">Step 2 · Editorial review</p>
          <h2 id="review-heading">{report ? "Editorial review report" : "Generate the review report"}</h2>
          {report ? <p>{report.summary}</p> : <p>PenPal checks structure, language, consistency, citations, references, metadata and ethics. It does not promise acceptance or make ungrounded substantive changes.</p>}
        </div>
        {!report && sourceReady ? <RunAnalysisButton manuscriptId={manuscript.id} /> : null}
        {!report && !sourceReady ? <span className="source-ready source-muted">Private source copy required</span> : null}
      </section>

      {report ? <section className="review-results" aria-label="Review results">
        <div className="section-heading"><div><p className="eyebrow">Findings</p><h2>{findings.length} items for attention</h2></div></div>
        {findings.length ? <div className="findings-list">{findings.map((finding) => <article className="finding" key={finding.id}><div className="finding-meta"><span className={`severity severity-${finding.severity}`}>{finding.severity}</span><span>{finding.finding_status}</span></div><h3>{finding.title}</h3><p>{finding.description}</p><blockquote>{finding.evidence_excerpt}</blockquote><p className="recommended-action"><strong>Suggested action:</strong> {finding.recommended_action}</p></article>)}</div> : <p className="empty-state">No validated findings were returned. Review the report summary above before deciding whether another editorial pass is needed.</p>}

        <div className="section-heading"><div><p className="eyebrow">Step 3 · Controlled edits</p><h2>Proposed edits</h2></div><span>{proposedCount ? `${proposedCount} awaiting your decision` : `${appliedCount} applied in the revised copy`}</span></div>
        {authorQueryCount ? <p className="editorial-note"><strong>Author queries are preserved in the review report.</strong> They are editorial questions, so PenPal does not insert them as replacement manuscript text.</p> : null}
        {suggestions.length ? <div className="suggestion-list">{suggestions.map((suggestion) => <article className="suggestion" key={suggestion.id}><div className="suggestion-meta"><span>{suggestion.suggestion_type.replaceAll("_", " ")}</span><span className={`suggestion-status ${suggestion.suggestion_status}`}>{suggestion.suggestion_status}</span></div><div className="change-grid"><div><small>Original</small><p>{suggestion.original_text}</p></div><div><small>Proposed</small><p>{suggestion.proposed_text}</p></div></div><p className="rationale"><strong>Why:</strong> {suggestion.rationale}</p>{suggestion.suggestion_status === "proposed" ? <form action={decideSuggestion} className="decision-row"><input name="suggestionId" type="hidden" value={suggestion.id} /><input name="manuscriptId" type="hidden" value={manuscript.id} /><button className="button button-small button-primary" name="decision" type="submit" value="approved">Approve</button><button className="button button-small button-secondary" name="decision" type="submit" value="rejected">Reject</button></form> : null}</article>)}</div> : <p className="empty-state">No narrow, source-validated edits were created. Use the report findings as your editorial guide.</p>}

        <section className="revision-card" aria-labelledby="revision-heading">
          <div>
            <p className="eyebrow">Step 4 · Revised manuscript</p>
            <h2 id="revision-heading">{revisedArtifact ? "Your revised Word copy is ready." : "Create the revised Word copy."}</h2>
            <p>{revisedArtifact ? "PenPal saved a separate copy after applying the approved narrow edits. Your original Google Drive file was not changed." : "When you continue, PenPal will approve the remaining narrow proposals and make a separate revised .docx. Author queries will remain in the report for follow-up."}</p>
          </div>
          {revisedArtifact && revisedDownload?.signedUrl ? <a className="button button-primary" href={revisedDownload.signedUrl}>Download revised .docx</a> : <FinalizeManuscriptButton manuscriptId={manuscript.id} />}
        </section>
      </section> : null}
    </main>
  );
}
