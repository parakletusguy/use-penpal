"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function FinalizeManuscriptButton({ manuscriptId }: { manuscriptId: number }) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function finaliseManuscript() {
    setIsRunning(true);
    setMessage(null);
    const response = await fetch(`/api/manuscripts/${manuscriptId}/finalize`, { method: "POST" });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : "PenPal could not create the revised Word copy.");
      setIsRunning(false);
      return;
    }
    const data = body as { applied?: number; authorQueries?: number; skipped?: number };
    const skipped = data.skipped ? ` ${data.skipped} proposal${data.skipped === 1 ? " needs" : "s need"} attention.` : "";
    const queries = data.authorQueries ? ` ${data.authorQueries} author quer${data.authorQueries === 1 ? "y remains" : "ies remain"} in the review report.` : "";
    setMessage(`Revised Word copy ready with ${data.applied ?? 0} applied edit${data.applied === 1 ? "" : "s"}.${queries}${skipped}`);
    setIsRunning(false);
    router.refresh();
  }

  return <div className="analysis-action"><button className="button button-primary" disabled={isRunning} onClick={finaliseManuscript} type="button">{isRunning ? "Creating revised copy…" : "Apply approved edits and create Word copy"}</button>{message ? <p role="status">{message}</p> : null}</div>;
}
