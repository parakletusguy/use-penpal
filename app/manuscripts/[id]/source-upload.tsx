"use client";

import { ChangeEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

const WORD_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function isSupportedSource(file: File) {
  return file.name.toLowerCase().endsWith(".docx") || file.type === WORD_MIME;
}

export function SourceUpload({ manuscriptId }: { manuscriptId: number }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function uploadSource(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!isSupportedSource(file)) {
      setMessage("Please choose the original .docx file for this manuscript.");
      return;
    }

    setIsUploading(true);
    setMessage(null);
    const supabase = createClient();
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
    const editorId = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;

    if (claimsError || !editorId) {
      setMessage("Your session has expired. Please sign in again.");
      setIsUploading(false);
      return;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${editorId}/${manuscriptId}/original/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("penpal-manuscripts")
      .upload(storagePath, file, { contentType: WORD_MIME, upsert: false });

    if (uploadError) {
      setMessage("The private copy could not be uploaded. Please try again.");
      setIsUploading(false);
      return;
    }

    const response = await fetch(`/api/manuscripts/${manuscriptId}/source`, {
      body: JSON.stringify({ contentType: WORD_MIME, fileName: file.name, storagePath }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      await supabase.storage.from("penpal-manuscripts").remove([storagePath]);
      setMessage("The source copy was not registered. Please try again.");
      setIsUploading(false);
      return;
    }

    setMessage("Private source copy ready for analysis.");
    setIsUploading(false);
    router.refresh();
  }

  return (
    <label className={`upload-button ${isUploading ? "is-uploading" : ""}`}>
      <input accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={isUploading} onChange={uploadSource} type="file" />
      {isUploading ? "Uploading private copy…" : "Add private .docx copy"}
      {message ? <span role="status">{message}</span> : null}
    </label>
  );
}
