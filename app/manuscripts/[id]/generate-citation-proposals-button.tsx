"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function GenerateCitationProposalsButton({ manuscriptId }: { manuscriptId: number }) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function generateProposals() {
    setIsRunning(true);
    setMessage(null);
    const response = await fetch(`/api/manuscripts/${manuscriptId}/propose-citation-corrections`, { method: "POST" });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : "PenPal could not create source-backed citation proposals.");
      setIsRunning(false);
      return;
    }
    const data = body as { autoApplyEligible?: number; created?: number; message?: string; reused?: boolean; total?: number };
    setMessage(data.message ?? (data.reused
      ? `${data.total ?? 0} existing citation proposal${data.total === 1 ? " is" : "s are"} ready for review.`
      : `${data.created ?? 0} source-backed citation proposal${data.created === 1 ? " is" : "s are"} ready for review. ${data.autoApplyEligible ?? 0} meet PenPal's highest-confidence threshold, but every change still needs your approval.`));
    setIsRunning(false);
    router.refresh();
  }

  return <div className="analysis-action"><button className="button button-primary" disabled={isRunning} onClick={generateProposals} type="button">{isRunning ? "Building source-backed proposals…" : "Build source-backed citation proposals"}</button>{message ? <p role="status">{message}</p> : null}</div>;
}
