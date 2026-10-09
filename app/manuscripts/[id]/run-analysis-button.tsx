"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunAnalysisButton({ manuscriptId }: { manuscriptId: number }) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function runAnalysis() {
    setIsRunning(true);
    setMessage(null);
    const response = await fetch(`/api/manuscripts/${manuscriptId}/analyze`, { method: "POST" });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string" ? (data as { error: string }).error : "PenPal could not complete the review.");
      setIsRunning(false);
      return;
    }
    setMessage("Review complete. Findings and suggestions are ready below.");
    setIsRunning(false);
    router.refresh();
  }

  return <div className="analysis-action"><button className="button button-primary" disabled={isRunning} onClick={runAnalysis} type="button">{isRunning ? "Analysing…" : "Run editorial analysis"}</button>{message ? <p role="status">{message}</p> : null}</div>;
}
