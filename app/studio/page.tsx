import Link from "next/link";
import { createAuthorProject } from "@/app/studio/actions";
import { BrandName } from "@/components/brand-name";
import { requireAuthor } from "@/lib/editor-access";

export default async function StudioPage() {
  const { supabase } = await requireAuthor();
  const { data: projects } = await supabase
    .from("author_projects")
    .select("id, title, research_area, intended_journal, updated_at")
    .eq("workspace_status", "active")
    .order("updated_at", { ascending: false });

  return (
    <main className="workspace-shell studio-shell">
      <nav className="workspace-nav" aria-label="Primary navigation">
        <Link className="brand" href="/studio"><BrandName /></Link>
        <div className="nav-links"><Link aria-current="page" href="/studio">Author studio</Link></div>
        <form action="/auth/signout" method="post"><button className="text-button" type="submit">Sign out</button></form>
      </nav>
      <header className="studio-hero"><p className="eyebrow">Author-owned workspace</p><h1>Build your paper on sources you control.</h1><p className="lede">Your project, sources, and readiness work are private to you. PenPal does not send material to an AI workflow until you explicitly approve source records for that purpose.</p></header>
      <section className="studio-grid" aria-label="Author projects">
        <section className="project-panel" aria-labelledby="new-project-heading">
          <p className="eyebrow">Start</p><h2 id="new-project-heading">Create a research project</h2>
          <form action={createAuthorProject} className="studio-form">
            <label htmlFor="title">Working title</label><input id="title" maxLength={240} name="title" required />
            <label htmlFor="researchArea">Research area <span>optional</span></label><input id="researchArea" maxLength={400} name="researchArea" />
            <label htmlFor="intendedJournal">Intended journal <span>optional</span></label><input id="intendedJournal" maxLength={400} name="intendedJournal" />
            <button className="button button-primary" type="submit">Create private project</button>
          </form>
        </section>
        <section className="project-panel" aria-labelledby="projects-heading">
          <p className="eyebrow">Your projects</p><h2 id="projects-heading">Research in progress</h2>
          {projects?.length ? <div className="author-project-list">{projects.map((project) => <Link href={`/studio/${project.id}`} key={project.id}><strong>{project.title}</strong><span>{project.intended_journal || project.research_area || "No journal selected yet"}</span></Link>)}</div> : <p className="empty-state">No author projects yet. Create one to start a private source ledger and readiness plan.</p>}
        </section>
      </section>
      <section className="studio-boundary" aria-labelledby="boundary-heading"><p className="eyebrow">Separate by design</p><h2 id="boundary-heading">This is not the IJSDS editorial workflow.</h2><p>Author projects are owner-scoped and have separate source and audit records. IJSDS consented submissions continue to use the dedicated editor-only workspace, with its own policy limits and access controls.</p></section>
    </main>
  );
}
