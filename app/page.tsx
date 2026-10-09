import Link from "next/link";
import { BrandName } from "@/components/brand-name";
import { requireEditor } from "@/lib/editor-access";

const workflow = [
  ["01", "Import", "Create a protected batch from the verified Drive folder."],
  ["02", "Prepare", "Add a private source copy for each document you want PenPal to analyse."],
  ["03", "Review", "Read evidence-backed technical findings and editorial suggestions."],
  ["04", "Approve", "Accept, reject, or refine each edit before any export."],
];

export default async function Page() {
  const { editorId, supabase } = await requireEditor();
  const [batchesResult, manuscriptsResult] = await Promise.all([
    supabase.from("import_batches").select("id, import_status, total_files, valid_file_count, imported_file_count").eq("editor_id", editorId).order("created_at", { ascending: false }).limit(1),
    supabase.from("manuscripts").select("id, workflow_status, original_storage_path").eq("editor_id", editorId),
  ]);

  const batch = batchesResult.data?.[0];
  const manuscripts = manuscriptsResult.data ?? [];
  const sourceReady = manuscripts.filter((item) => item.original_storage_path).length;
  const reviewReady = manuscripts.filter((item) => item.workflow_status === "ready_to_review").length;

  return (
    <main className="workspace-shell">
      <nav className="workspace-nav" aria-label="Primary navigation">
        <Link className="brand" href="/"><BrandName /></Link>
        <div className="nav-links" aria-label="Workspace sections">
          <Link aria-current="page" href="/">Overview</Link>
          <Link href="/manuscripts">Manuscripts</Link>
          <Link href="/import">Import</Link>
        </div>
        <form action="/auth/signout" method="post"><button className="text-button" type="submit">Sign out</button></form>
      </nav>

      <section className="hero workspace-hero">
        <p className="eyebrow">Editorial workspace</p>
        <h1>Precise editorial review, with you in control.</h1>
        <p className="lede">
          PenPal prepares consented manuscripts for editorial attention. It preserves the source,
          explains each suggestion, and never applies a change without your decision.
        </p>
        <div className="hero-actions">
          <Link className="button button-primary" href={batch ? "/manuscripts" : "/import"}>{batch ? "Open manuscripts" : "Import IJSDS batch"}</Link>
          <Link className="button button-secondary" href="/import">View intake status</Link>
        </div>
      </section>

      <section className="metric-grid" aria-label="Workspace progress">
        <article><p>Batch</p><strong>{batch ? `${batch.imported_file_count} imported` : "Not imported"}</strong><span>{batch ? "IJSDS verified folder" : "Ready when you are"}</span></article>
        <article><p>Private source copies</p><strong>{sourceReady} / {manuscripts.length || 20}</strong><span>Ready for AI analysis</span></article>
        <article><p>Review queue</p><strong>{reviewReady}</strong><span>Available to analyse now</span></article>
      </section>

      <section aria-labelledby="workflow-heading" className="workflow">
        <div><p className="eyebrow">Your workflow</p><h2 id="workflow-heading">From source folder to author-ready revision.</h2></div>
        <ol>{workflow.map(([number, title, description]) => <li key={number}><span>{number}</span><div><h3>{title}</h3><p>{description}</p></div></li>)}</ol>
      </section>

      <section className="guardrail" aria-labelledby="guardrail-heading">
        <p className="eyebrow">Editorial guardrail</p>
        <h2 id="guardrail-heading">No acceptance promises. No invented evidence. No automatic rewriting.</h2>
        <p>PenPal identifies technical and editorial issues, cites the source text it used, and keeps every substantive decision with the editor and author.</p>
      </section>
    </main>
  );
}
