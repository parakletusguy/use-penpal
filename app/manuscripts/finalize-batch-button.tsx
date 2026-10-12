"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ManuscriptForFinalisation = {
  id: number;
  title: string | null;
  workflowStatus: string;
};

type FinalizeBatchButtonProps = {
  manuscripts: ManuscriptForFinalisation[];
};

function readyForFinalisation(manuscript: ManuscriptForFinalisation) {
  return ["ready_to_edit", "ready_to_export"].includes(manuscript.workflowStatus);
}

function displayTitle(manuscript: ManuscriptForFinalisation) {
  return manuscript.title || `Paper ${manuscript.id}`;
}

export function FinalizeBatchButton({ manuscripts }: FinalizeBatchButtonProps) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const queue = manuscripts.filter(readyForFinalisation);

  async function finaliseBatch() {
    if (!queue.length) return;
    setIsRunning(true);
    setSummary(null);
    const attention: string[] = [];
    let completed = 0;

    for (const [index, manuscript] of queue.entries()) {
      setProgress(`Creating a revised copy from approved edits for paper ${index + 1} of ${queue.length}: ${displayTitle(manuscript)}…`);
      const response = await fetch(`/api/manuscripts/${manuscript.id}/finalize`, { method: "POST" });
      if (response.ok) completed += 1;
      else attention.push(displayTitle(manuscript));
    }

    setProgress(null);
    setSummary(attention.length
      ? `${completed} revised Word cop${completed === 1 ? "y is" : "ies are"} ready. ${attention.length} paper${attention.length === 1 ? " needs" : "s need"} attention.`
      : `${completed} revised Word cop${completed === 1 ? "y is" : "ies are"} ready. Each original in Drive remains unchanged.`);
    setIsRunning(false);
    router.refresh();
  }

  if (!queue.length) return null;

  return (
    <section className="batch-finalise-card" aria-label="Create revised Word copies">
      <div>
        <p className="eyebrow">Batch finalisation</p>
        <h2>Create revised Word copies from editor-approved edits</h2>
        <p>PenPal only applies decisions you have already approved. Papers with proposed items are left for your review; author queries stay in the report because they require an author response, not replacement text.</p>
      </div>
      <div className="batch-review-actions">
        <button className="button button-primary" disabled={isRunning} onClick={finaliseBatch} type="button">
          {isRunning ? "Creating revised copies…" : `Create copies for ${queue.length} paper${queue.length === 1 ? "" : "s"}`}
        </button>
        {progress ? <p role="status">{progress}</p> : null}
        {summary ? <p className="form-message success" role="status">{summary}</p> : null}
      </div>
    </section>
  );
}
