"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function VerifyReferencesButton({ manuscriptId }: { manuscriptId: number }) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function verifyReferences() {
    setIsRunning(true);
    setMessage(null);
    const response = await fetch(`/api/manuscripts/${manuscriptId}/verify-references`, { method: "POST" });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : "PenPal could not complete the reference verification.");
      setIsRunning(false);
      return;
    }

    const data = body as { attentionReferences?: number; references?: number; verifiedReferences?: number };
    setMessage(`${data.verifiedReferences ?? 0} of ${data.references ?? 0} references verified. ${data.attentionReferences ?? 0} need editor attention; PenPal has not changed any citation.`);
    setIsRunning(false);
    router.refresh();
  }

  return (
    <div className="analysis-action">
      <button className="button button-secondary" disabled={isRunning} onClick={verifyReferences} type="button">
        {isRunning ? "Checking references…" : "Verify references"}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
