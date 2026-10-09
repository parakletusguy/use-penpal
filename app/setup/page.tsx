import { notFound } from "next/navigation";
import { BrandName } from "@/components/brand-name";
import { LocalOpenAiSetup } from "./local-openai-setup";

export const dynamic = "force-dynamic";

export default function LocalSetupPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="setup-heading">
        <BrandName />
        <p className="eyebrow">LOCAL PENPAL SETUP</p>
        <h1 id="setup-heading">Connect OpenAI</h1>
        <p className="login-copy">
          Paste the new API key below. It stays on this computer, is hidden while you paste,
          and is removed when the local PenPal server restarts.
        </p>
        <LocalOpenAiSetup />
      </section>
    </main>
  );
}
