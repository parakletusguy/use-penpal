"use client";

import { FormEvent, useState } from "react";

export function LocalOpenAiSetup() {
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function configureKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/development/openai-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const result = (await response.json()) as { configured?: boolean; error?: string };

      if (!response.ok || !result.configured) {
        setMessage(result.error ?? "PenPal could not configure the key. Please try again.");
        return;
      }

      setApiKey("");
      setMessage("OpenAI is configured for this local PenPal session.");
    } catch {
      setMessage("PenPal could not configure the key. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="sign-in-form" onSubmit={configureKey}>
      <label htmlFor="openai-api-key">OpenAI API key</label>
      <input
        id="openai-api-key"
        name="openai-api-key"
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={apiKey}
        onChange={(event) => setApiKey(event.target.value)}
        placeholder="Paste the new key here"
        required
      />
      <button type="submit" className="primary-button" disabled={isSubmitting}>
        {isSubmitting ? "Configuring OpenAI…" : "Configure OpenAI for this session"}
      </button>
      {message ? <p className="form-message" role="status">{message}</p> : null}
    </form>
  );
}
