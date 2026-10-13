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
  const refreshQueue = manuscripts.filter((manuscript) => manuscript.originalStoragePath);

  async function verifyBatch(targets: ManuscriptForVerification[]) {
    if (!targets.length) return;
    setIsRunning(true);
    setSummary(null);
    const attention: string[] = [];
    let completed = 0;

    for (const [index, manuscript] of targets.entries()) {
      setProgress(`Verifying references for paper ${index + 1} of ${targets.length}: ${displayTitle(manuscript)}…`);
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

  if (!refreshQueue.length) return null;

  return (
    <section className="batch-reference-card" aria-label="Batch reference verification">
      <div>
        <p className="eyebrow">Batch reference verification</p>
        <h2>{queue.length ? `Verify sources for ${queue.length} paper${queue.length === 1 ? "" : "s"}` : `Refresh source checks for ${refreshQueue.length} paper${refreshQueue.length === 1 ? "" : "s"}`}</h2>
        <p>PenPal checks bibliographic metadata and in-text citation links one paper at a time. Refreshing creates a newer verification record after parser or metadata-source improvements; it does not alter references or manuscript claims.</p>
      </div>
      <div className="batch-review-actions">
        {queue.length ? <button className="button button-primary" disabled={isRunning} onClick={() => verifyBatch(queue)} type="button">
          {isRunning ? "Verifying references…" : `Verify ${queue.length} paper${queue.length === 1 ? "" : "s"}`}
        </button> : null}
        <button className={queue.length ? "button button-secondary" : "button button-primary"} disabled={isRunning} onClick={() => verifyBatch(refreshQueue)} type="button">
          {isRunning ? "Verifying references…" : `Refresh all ${refreshQueue.length} paper${refreshQueue.length === 1 ? "" : "s"}`}
        </button>
        {progress ? <p role="status">{progress}</p> : null}
        {summary ? <p className="form-message" role="status">{summary}</p> : null}
      </div>
    </section>
  );
}
