import Link from "next/link";
import { BrandName } from "@/components/brand-name";
import { driveFileUrl } from "@/lib/initial-ijsds-batch";
import { requireEditor } from "@/lib/editor-access";

function labelFromStatus(status: string) {
  return status.replaceAll("_", " ");
}

export default async function ManuscriptsPage() {
  const { editorId, supabase } = await requireEditor();
  const { data: manuscripts } = await supabase
    .from("manuscripts")
    .select("id, title, source_file_id, source_file_name, workflow_status, original_storage_path, updated_at")
    .eq("editor_id", editorId)
    .order("created_at");

  return (
    <main className="workspace-shell">
      <nav className="workspace-nav" aria-label="Primary navigation">
        <Link className="brand" href="/"><BrandName /></Link>
        <div className="nav-links"><Link href="/">Overview</Link><Link aria-current="page" href="/manuscripts">Manuscripts</Link><Link href="/import">Import</Link></div>
        <form action="/auth/signout" method="post"><button className="text-button" type="submit">Sign out</button></form>
      </nav>
      <header className="listing-header"><div><p className="eyebrow">Editorial batch</p><h1>Manuscripts</h1><p className="lede">Each source remains unchanged in Drive. Add a private copy only when you are ready for PenPal’s editorial review.</p></div><span className="manuscript-count">{manuscripts?.length ?? 0} papers</span></header>
      {manuscripts?.length ? <div className="manuscript-list">{manuscripts.map((manuscript) => <article className="manuscript-row" key={manuscript.id}><div className="manuscript-info"><p className="manuscript-title">{manuscript.title ?? manuscript.source_file_name}</p><a href={driveFileUrl(manuscript.source_file_id)} rel="noreferrer" target="_blank">Drive original ↗</a></div><div className="manuscript-state"><span className={`status status-${manuscript.workflow_status}`}>{labelFromStatus(manuscript.workflow_status)}</span><span>{manuscript.original_storage_path ? "Private copy ready" : "Source needed"}</span></div><Link className="button button-secondary" href={`/manuscripts/${manuscript.id}`}>Open</Link></article>)}</div> : <section className="empty-panel"><h2>Your IJSDS batch has not been added yet.</h2><p>PenPal has already verified the 20 Drive files and their recorded consent.</p><Link className="button button-primary" href="/import">Import verified batch</Link></section>}
    </main>
  );
}
