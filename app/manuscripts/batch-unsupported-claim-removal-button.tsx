"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ManuscriptForClaimRemoval = { id: number; title: string | null };

export function BatchUnsupportedClaimRemovalButton({ manuscripts }: { manuscripts: ManuscriptForClaimRemoval[] }) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  async function removeUnsupportedClaims() {
    setIsRunning(true);
    setSummary(null);
    let removed = 0;
    const attention: string[] = [];
    for (const [index, manuscript] of manuscripts.entries()) {
      setProgress(`Removing unsupported citation-dependent claims from paper ${index + 1} of ${manuscripts.length}: ${manuscript.title || `Paper ${manuscript.id}`}…`);
      try {
        const response = await fetch(`/api/manuscripts/${manuscript.id}/remove-unsupported-citations`, { method: "POST" });
        const result = await response.json().catch(() => null) as { created?: number } | null;
        if (!response.ok) attention.push(manuscript.title || `Paper ${manuscript.id}`);
        else removed += result?.created ?? 0;
      } catch {
        attention.push(manuscript.title || `Paper ${manuscript.id}`);
      }
    }
    setProgress(null);
    setSummary(attention.length
      ? `${removed} unsupported citation-dependent claim${removed === 1 ? " was" : "s were"} removed from the next separate revisions. ${attention.length} paper${attention.length === 1 ? " needs" : "s need"} attention.`
      : `${removed} unsupported citation-dependent claim${removed === 1 ? " is" : "s are"} approved for removal from the next separate revisions.`);
    setIsRunning(false);
    router.refresh();
  }

  if (!manuscripts.length) return null;
  return (
    <section className="batch-finalise-card" aria-label="Remove unsupported citation-dependent claims">
      <div>
        <p className="eyebrow">Unsupported-source fallback</p>
        <h2>Remove claims that do not have an authentic source</h2>
        <p>Under the recorded editorial instruction, PenPal removes the complete sentence containing an unresolved citation rather than leaving a claim supported by a fabricated, conflicting, or unverified reference. The change is saved only in the next revised copy.</p>
      </div>
      <div className="batch-review-actions">
        <button className="button button-primary" disabled={isRunning} onClick={removeUnsupportedClaims} type="button">
          {isRunning ? "Preparing claim removals…" : `Prepare removals for ${manuscripts.length} paper${manuscripts.length === 1 ? "" : "s"}`}
        </button>
        {progress ? <p role="status">{progress}</p> : null}
        {summary ? <p className="form-message" role="status">{summary}</p> : null}
      </div>
    </section>
  );
}
