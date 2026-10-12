"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ManuscriptForVerification = {
  hasCitationRun: boolean;
  id: number;
  originalStoragePath: string | null;
  title: string | null;
};

function displayTitle(manuscript: ManuscriptForVerification) {
  return manuscript.title || `Paper ${manuscript.id}`;
}

export function BatchReferenceVerificationButton({ manuscripts }: { manuscripts: ManuscriptForVerification[] }) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const queue = manuscripts.filter((manuscript) => manuscript.originalStoragePath && !manuscript.hasCitationRun);

  async function verifyBatch() {
    if (!queue.length) return;
    setIsRunning(true);
    setSummary(null);
    const attention: string[] = [];
    let completed = 0;

    for (const [index, manuscript] of queue.entries()) {
      setProgress(`Verifying references for paper ${index + 1} of ${queue.length}: ${displayTitle(manuscript)}…`);
      const response = await fetch(`/api/manuscripts/${manuscript.id}/verify-references`, { method: "POST" });
      if (response.ok) completed += 1;
      else attention.push(displayTitle(manuscript));
    }

    setProgress(null);
    setSummary(attention.length
      ? `${completed} verification run${completed === 1 ? "" : "s"} completed. ${attention.length} paper${attention.length === 1 ? " needs" : "s need"} attention.`
      : `${completed} reference-verification run${completed === 1 ? " is" : "s are"} ready for editorial review.`);
    setIsRunning(false);
    router.refresh();
  }

  if (!queue.length) return null;

  return (
    <section className="batch-reference-card" aria-label="Batch reference verification">
      <div>
        <p className="eyebrow">Batch reference verification</p>
        <h2>Verify sources for {queue.length} paper{queue.length === 1 ? "" : "s"}</h2>
        <p>PenPal checks bibliographic metadata and in-text citation links one paper at a time. It does not alter references or manuscript claims.</p>
      </div>
      <div className="batch-review-actions">
        <button className="button button-primary" disabled={isRunning} onClick={verifyBatch} type="button">
          {isRunning ? "Verifying references…" : `Verify ${queue.length} paper${queue.length === 1 ? "" : "s"}`}
        </button>
        {progress ? <p role="status">{progress}</p> : null}
        {summary ? <p className="form-message" role="status">{summary}</p> : null}
      </div>
    </section>
  );
}
