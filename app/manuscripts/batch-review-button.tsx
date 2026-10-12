"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type BatchManuscript = {
  id: number;
  originalStoragePath: string | null;
  workflowStatus: string;
};

type BatchReviewButtonProps = {
  manuscripts: BatchManuscript[];
};

function shouldReview(manuscript: BatchManuscript) {
  return !["checking", "ready_to_edit", "ready_to_export", "exported"].includes(manuscript.workflowStatus);
}

async function requestJson(url: string) {
  const response = await fetch(url, { method: "POST" });
  const body = await response.json().catch(() => ({}));
  return { body, ok: response.ok };
}

export function BatchReviewButton({ manuscripts }: BatchReviewButtonProps) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const queue = manuscripts.filter(shouldReview);

  async function runBatchReview() {
    if (!queue.length) return;
    setIsRunning(true);
    setSummary(null);
    let completed = 0;
    const attention: number[] = [];

    for (const [index, manuscript] of queue.entries()) {
      setProgress(`Preparing paper ${index + 1} of ${queue.length}… Keep this page open.`);
      if (!manuscript.originalStoragePath) {
        const source = await requestJson(`/api/manuscripts/${manuscript.id}/drive-source`);
        if (!source.ok) {
          attention.push(manuscript.id);
          continue;
        }
      }

      setProgress(`Reviewing paper ${index + 1} of ${queue.length}… Keep this page open.`);
      const review = await requestJson(`/api/manuscripts/${manuscript.id}/analyze`);
      if (review.ok) completed += 1;
      else attention.push(manuscript.id);
    }

    setProgress(null);
    setSummary(attention.length
      ? `${completed} review${completed === 1 ? "" : "s"} completed. ${attention.length} paper${attention.length === 1 ? " needs" : "s need"} attention.`
      : `${completed} editorial review${completed === 1 ? " is" : "s are"} ready for your decision.`);
    setIsRunning(false);
    router.refresh();
  }

  if (!queue.length) return null;

  return (
    <section className="batch-review-card" aria-label="Batch editorial review">
      <div>
        <p className="eyebrow">Batch review</p>
        <h2>Review the remaining {queue.length} paper{queue.length === 1 ? "" : "s"}</h2>
        <p>PenPal will copy each shared Drive source privately, review one paper at a time, and leave every proposed edit awaiting your approval. Originals in Drive are never changed.</p>
      </div>
      <div className="batch-review-actions">
        <button className="button button-primary" disabled={isRunning} onClick={runBatchReview} type="button">
          {isRunning ? "Reviewing batch…" : `Review ${queue.length} remaining paper${queue.length === 1 ? "" : "s"}`}
        </button>
        {progress ? <p role="status">{progress}</p> : null}
        {summary ? <p className="form-message" role="status">{summary}</p> : null}
      </div>
    </section>
  );
}
