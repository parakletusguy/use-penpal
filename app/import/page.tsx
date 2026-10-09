import Link from "next/link";
import { BrandName } from "@/components/brand-name";
import { ImportButton } from "@/app/import/import-button";
import { IJSDS_INITIAL_FOLDER, IJSDS_INITIAL_MANUSCRIPTS } from "@/lib/initial-ijsds-batch";
import { requireEditor } from "@/lib/editor-access";

const steps = ["Folder verified", "Files validated", "Consent recorded", "Ready to import"];

export default async function ImportPage() {
  const { editorId, supabase } = await requireEditor();
  const { count } = await supabase
    .from("manuscripts")
    .select("id", { count: "exact", head: true })
    .eq("editor_id", editorId)
    .in("source_file_id", IJSDS_INITIAL_MANUSCRIPTS.map(([id]) => id));
  const alreadyImported = (count ?? 0) > 0;

  return (
    <main className="workspace-shell">
      <nav className="workspace-nav" aria-label="Primary navigation">
        <Link className="brand" href="/"><BrandName /></Link>
        <div className="nav-links"><Link href="/">Overview</Link><Link href="/manuscripts">Manuscripts</Link></div>
        <form action="/auth/signout" method="post"><button className="text-button" type="submit">Sign out</button></form>
      </nav>

      <Link className="back-link" href="/">← Back to overview</Link>
      <section className="import-layout" aria-labelledby="import-heading">
        <div>
          <p className="eyebrow">Verified source</p>
          <h1 id="import-heading">Your IJSDS batch is ready to enter PenPal.</h1>
          <p className="lede">
            The <strong>{IJSDS_INITIAL_FOLDER.name}</strong> folder contains 20 supported Word manuscripts.
            Every author’s AI consent has been recorded. Importing creates secure workspace records;
            it never moves, edits, or replaces the Google Drive originals.
          </p>
        </div>
        <ol className="step-list">
          {steps.map((step, index) => (
            <li className="active" key={step}><span>✓</span>{index + 1}. {step}</li>
          ))}
        </ol>
      </section>

      <section className="connection-card" aria-labelledby="drive-heading">
        <div>
          <p className="eyebrow">Final intake step</p>
          <h2 id="drive-heading">Create the protected editorial batch.</h2>
          <dl className="import-facts">
            <div><dt>Folder</dt><dd>{IJSDS_INITIAL_FOLDER.name}</dd></div>
            <div><dt>Manuscripts</dt><dd>20 Word documents</dd></div>
            <div><dt>Source state</dt><dd>Originals remain in Google Drive</dd></div>
          </dl>
        </div>
        <ImportButton alreadyImported={alreadyImported} />
      </section>
    </main>
  );
}
