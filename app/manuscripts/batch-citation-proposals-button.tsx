"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ManuscriptForCitationProposals = {
  id: number;
  title: string | null;
};

function title(manuscript: ManuscriptForCitationProposals) {
  return manuscript.title || `Paper ${manuscript.id}`;
}

export function BatchCitationProposalsButton({ manuscripts }: { manuscripts: ManuscriptForCitationProposals[] }) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  async function buildBatch() {
    setIsRunning(true);
    setSummary(null);
    const attention: string[] = [];
    let created = 0;
    let reusable = 0;

    for (const [index, manuscript] of manuscripts.entries()) {
      setProgress(`Checking paper ${index + 1} of ${manuscripts.length}: ${title(manuscript)}…`);
      try {
        const response = await fetch(`/api/manuscripts/${manuscript.id}/propose-citation-corrections`, { method: "POST" });
        const result = await response.json().catch(() => null) as { created?: number; reused?: boolean } | null;
        if (!response.ok) attention.push(title(manuscript));
        else if (result?.reused) reusable += 1;
        else created += result?.created ?? 0;
      } catch {
        attention.push(title(manuscript));
      }
    }

    setProgress(null);
    setSummary(attention.length
      ? `${created} source-backed correction${created === 1 ? " was" : "s were"} created; ${attention.length} paper${attention.length === 1 ? " needs" : "s need"} a manual source decision.`
      : `${created} source-backed correction${created === 1 ? " is" : "s are"} ready for review${reusable ? `; ${reusable} paper${reusable === 1 ? " already has" : "s already have"} a recorded decision` : ""}.`);
    setIsRunning(false);
    router.refresh();
  }

  if (!manuscripts.length) return null;

  return (
    <section className="batch-remediation-card" aria-label="Batch source-backed corrections">
      <div>
        <p className="eyebrow">Source recovery</p>
        <h2>Build corrections across the verified batch</h2>
        <p>PenPal checks each entry against Crossref and OpenAlex. It proposes a correction only when live metadata supports the same source; a conflicting or unsupported item remains out of the revised copy until it is deliberately revised or removed.</p>
      </div>
      <div className="batch-review-actions">
        <button className="button button-primary" disabled={isRunning} onClick={buildBatch} type="button">
          {isRunning ? "Building source-backed corrections…" : `Check all ${manuscripts.length} paper${manuscripts.length === 1 ? "" : "s"}`}
        </button>
        {progress ? <p role="status">{progress}</p> : null}
        {summary ? <p className="form-message" role="status">{summary}</p> : null}
      </div>
    </section>
  );
}
