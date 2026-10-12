"use client";

import { useState } from "react";

export function UploadRevisedToDriveButton({ manuscriptId }: { manuscriptId: number }) {
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  async function upload() {
    setIsUploading(true);
    setMessage(null);
    const response = await fetch(`/api/manuscripts/${manuscriptId}/upload-revised-to-drive`, { method: "POST" });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : "PenPal could not upload the revised Word copy to Drive.");
      setIsUploading(false);
      return;
    }
    const result = body as { reused?: boolean; url?: string };
    setUrl(typeof result.url === "string" ? result.url : null);
    setMessage(result.reused ? "The revised copy is already in the configured Drive output folder." : "Revised Word copy uploaded to the configured Drive output folder.");
    setIsUploading(false);
  }

  return <div className="analysis-action"><button className="button button-secondary" disabled={isUploading} onClick={upload} type="button">{isUploading ? "Uploading to Drive…" : "Upload revised copy to Drive"}</button>{message ? <p role="status">{url ? <a className="drive-link" href={url} rel="noreferrer" target="_blank">{message} ↗</a> : message}</p> : null}</div>;
}
