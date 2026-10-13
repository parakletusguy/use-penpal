import Link from "next/link";
import { BrandName } from "@/components/brand-name";
import { BatchReferenceVerificationButton } from "@/app/manuscripts/batch-reference-verification-button";
import { BatchCitationProposalsButton } from "@/app/manuscripts/batch-citation-proposals-button";
import { BatchReviewButton } from "@/app/manuscripts/batch-review-button";
import { FinalizeBatchButton } from "@/app/manuscripts/finalize-batch-button";
import { driveFileUrl } from "@/lib/initial-ijsds-batch";
import { requireEditor } from "@/lib/editor-access";

function labelFromStatus(status: string) {
  return status.replaceAll("_", " ");
}

export default async function ManuscriptsPage() {
  const { editorId, supabase } = await requireEditor();
  const [{ data: manuscripts }, { data: citationRuns }] = await Promise.all([
    supabase
      .from("manuscripts")
      .select("id, title, source_file_id, source_file_name, workflow_status, original_storage_path, updated_at")
      .eq("editor_id", editorId)
      .order("created_at"),
    supabase
      .from("citation_verification_runs")
      .select("manuscript_id")
      .eq("editor_id", editorId),
  ]);
  const manuscriptsWithRuns = new Set((citationRuns ?? []).map((run) => run.manuscript_id));

  return (
    <main className="workspace-shell">
      <nav className="workspace-nav" aria-label="Primary navigation">
        <Link className="brand" href="/"><BrandName /></Link>
        <div className="nav-links"><Link href="/">Overview</Link><Link aria-current="page" href="/manuscripts">Manuscripts</Link><Link href="/import">Import</Link></div>
        <form action="/auth/signout" method="post"><button className="text-button" type="submit">Sign out</button></form>
      </nav>
      <header className="listing-header"><div><p className="eyebrow">Editorial batch</p><h1>Manuscripts</h1><p className="lede">Each source remains unchanged in Drive. PenPal can prepare a private copy and review the remaining batch one paper at a time.</p></div><span className="manuscript-count">{manuscripts?.length ?? 0} papers</span></header>
      {manuscripts?.length ? <BatchReviewButton manuscripts={manuscripts.map((manuscript) => ({ id: manuscript.id, originalStoragePath: manuscript.original_storage_path, workflowStatus: manuscript.workflow_status }))} /> : null}
      {manuscripts?.length ? <BatchReferenceVerificationButton manuscripts={manuscripts.map((manuscript) => ({ hasCitationRun: manuscriptsWithRuns.has(manuscript.id), id: manuscript.id, originalStoragePath: manuscript.original_storage_path, title: manuscript.title }))} /> : null}
      {manuscripts?.length && manuscriptsWithRuns.size ? <BatchCitationProposalsButton manuscripts={manuscripts.filter((manuscript) => manuscriptsWithRuns.has(manuscript.id)).map((manuscript) => ({ id: manuscript.id, title: manuscript.title }))} /> : null}
      {manuscripts?.length && manuscriptsWithRuns.size ? <section className="batch-remediation-card" aria-label="Batch citation remediation"><div><p className="eyebrow">Citation remediation</p><h2>Prepare the author-query worklist</h2><p>Download one evidence-based packet for the whole batch. It records exactly what must be supplied or consciously revised; it never invents citations or rewrites the manuscripts.</p></div><div className="batch-review-actions"><a className="button button-primary" href="/api/citation-remediation">Download all citation worklists</a></div></section> : null}
      {manuscripts?.length ? <FinalizeBatchButton manuscripts={manuscripts.map((manuscript) => ({ id: manuscript.id, title: manuscript.title, workflowStatus: manuscript.workflow_status }))} /> : null}
      {manuscripts?.length ? <div className="manuscript-list">{manuscripts.map((manuscript) => <article className="manuscript-row" key={manuscript.id}><div className="manuscript-info"><p className="manuscript-title">{manuscript.title ?? manuscript.source_file_name}</p><a href={driveFileUrl(manuscript.source_file_id)} rel="noreferrer" target="_blank">Drive original ↗</a></div><div className="manuscript-state"><span className={`status status-${manuscript.workflow_status}`}>{manuscript.workflow_status === "exported" ? "Revised copy ready" : labelFromStatus(manuscript.workflow_status)}</span><span>{manuscript.workflow_status === "exported" ? "Approved edits saved separately" : manuscript.original_storage_path ? "Private copy ready" : "Source needed"}</span></div><Link className="button button-secondary" href={`/manuscripts/${manuscript.id}`}>{manuscript.workflow_status === "exported" ? "View output" : "Open"}</Link></article>)}</div> : <section className="empty-panel"><h2>Your IJSDS batch has not been added yet.</h2><p>PenPal has already verified the 19 Drive files and their recorded consent.</p><Link className="button button-primary" href="/import">Import verified batch</Link></section>}
    </main>
  );
}
