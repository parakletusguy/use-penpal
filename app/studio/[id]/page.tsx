import Link from "next/link";
import { notFound } from "next/navigation";
import { addProjectSource, addResearchTask, updateReadinessCheck } from "@/app/studio/actions";
import { BrandName } from "@/components/brand-name";
import { requireAuthor } from "@/lib/editor-access";

function validId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export default async function AuthorProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const projectId = validId((await params).id);
  if (!projectId) notFound();

  const { ownerId, supabase } = await requireAuthor();
  const [projectResult, sourcesResult, tasksResult, checksResult] = await Promise.all([
    supabase.from("author_projects").select("id, title, research_area, intended_journal").eq("id", projectId).eq("owner_id", ownerId).maybeSingle(),
    supabase.from("project_sources").select("id, citation, doi, source_url, verification_status, approved_for_synthesis").eq("project_id", projectId).eq("owner_id", ownerId).order("created_at", { ascending: false }),
    supabase.from("research_tasks").select("id, prompt, target_section, task_status").eq("project_id", projectId).eq("owner_id", ownerId).order("created_at", { ascending: false }),
    supabase.from("readiness_checks").select("id, criterion_label, guidance, check_status").eq("project_id", projectId).eq("owner_id", ownerId).order("created_at"),
  ]);
  const project = projectResult.data;
  if (!project) notFound();
  const sources = sourcesResult.data ?? [];
  const tasks = tasksResult.data ?? [];
  const checks = checksResult.data ?? [];
  const approvedSources = sources.filter((source) => source.approved_for_synthesis).length;

  return (
    <main className="workspace-shell studio-shell">
      <nav className="workspace-nav" aria-label="Primary navigation"><Link className="brand" href="/studio"><BrandName /></Link><div className="nav-links"><Link href="/studio">Author studio</Link><Link aria-current="page" href={`/studio/${project.id}`}>Project</Link></div><form action="/auth/signout" method="post"><button className="text-button" type="submit">Sign out</button></form></nav>
      <Link className="back-link" href="/studio">← All author projects</Link>
      <header className="project-header"><p className="eyebrow">Private author project</p><h1>{project.title}</h1><p className="lede">{project.intended_journal ? `Working toward ${project.intended_journal}. ` : "No journal target selected yet. "}Readiness is a transparent checklist, never an acceptance prediction.</p></header>
      <section className="source-ledger" aria-labelledby="sources-heading">
        <div><p className="eyebrow">1 · Source ledger</p><h2 id="sources-heading">Ground future drafting in sources you approve.</h2><p>Adding a source does not make it usable by AI. Only the author can explicitly approve a source for a future grounded-drafting step.</p></div>
        <form action={addProjectSource} className="studio-form compact-form"><input name="projectId" type="hidden" value={project.id} /><label htmlFor="citation">Citation or source record</label><textarea id="citation" maxLength={4000} name="citation" required rows={4} /><label htmlFor="doi">DOI <span>optional</span></label><input id="doi" maxLength={512} name="doi" /><label htmlFor="sourceUrl">Source URL <span>optional</span></label><input id="sourceUrl" maxLength={2048} name="sourceUrl" type="url" /><label className="consent-check"><input name="approveForSynthesis" type="checkbox" /> I confirm this is an accurate source record and may be used as context in a future grounded draft.</label><button className="button button-secondary" type="submit">Add source</button></form>
        <p className="ledger-summary"><strong>{approvedSources}</strong> of {sources.length} source records are approved for future grounded drafting.</p>
        {sources.length ? <div className="ledger-list">{sources.map((source) => <article key={source.id}><div><strong>{source.citation}</strong>{source.doi ? <span>DOI: {source.doi}</span> : null}</div><span className={source.approved_for_synthesis ? "ledger-status approved" : "ledger-status"}>{source.approved_for_synthesis ? "Author approved" : "Not approved"}</span></article>)}</div> : null}
      </section>
      <section className="research-plan" aria-labelledby="tasks-heading">
        <div><p className="eyebrow">2 · Research plan</p><h2 id="tasks-heading">Ask a focused question before drafting.</h2><p>Tasks remain blocked for grounded drafting until the source ledger contains an author-approved record. This release stores the plan; it does not generate prose.</p></div>
        <form action={addResearchTask} className="studio-form compact-form"><input name="projectId" type="hidden" value={project.id} /><label htmlFor="prompt">What do you need to develop?</label><textarea id="prompt" maxLength={4000} name="prompt" required rows={3} /><label htmlFor="targetSection">Target section <span>optional</span></label><input id="targetSection" maxLength={240} name="targetSection" placeholder="e.g., Literature review" /><button className="button button-secondary" type="submit">Save research task</button></form>
        {tasks.length ? <div className="task-list">{tasks.map((task) => <article key={task.id}><span className={`task-status ${task.task_status}`}>{statusLabel(task.task_status)}</span><strong>{task.target_section || "Unassigned section"}</strong><p>{task.prompt}</p></article>)}</div> : null}
      </section>
      <section className="readiness-panel" aria-labelledby="readiness-heading"><div><p className="eyebrow">3 · Journal readiness</p><h2 id="readiness-heading">Prepare, don’t predict.</h2><p>This generic pre-submission profile tracks items that need evidence or author input. Verify journal-specific requirements before submission.</p></div><div className="check-list">{checks.map((check) => <article key={check.id}><div><h3>{check.criterion_label}</h3><p>{check.guidance}</p></div><form action={updateReadinessCheck}><input name="projectId" type="hidden" value={project.id} /><input name="checkId" type="hidden" value={check.id} /><select aria-label={`Status for ${check.criterion_label}`} defaultValue={check.check_status} name="status"><option value="not_started">Not started</option><option value="needs_author_input">Needs author input</option><option value="ready">Ready</option></select><button className="button button-small button-secondary" type="submit">Save</button></form></article>)}</div></section>
    </main>
  );
}
