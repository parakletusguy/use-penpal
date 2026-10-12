"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/utils/supabase/client";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });

    setIsSubmitting(false);
    setMessage(
      error
        ? "We could not send the sign-in link. Please check the address and try again."
        : "Check your inbox for your secure PenPal sign-in link.",
    );
  }

  async function handleGoogleSignIn() {
    setIsGoogleSigningIn(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/confirm` },
    });

    if (error) {
      setMessage("Google sign-in is not available yet. Please use the secure sign-in link for now.");
      setIsGoogleSigningIn(false);
    }
  }

  return (
    <form className="sign-in-form" onSubmit={handleSubmit}>
      <label htmlFor="email">Email address</label>
      <input
        autoComplete="email"
        id="email"
        name="email"
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        required
        type="email"
        value={email}
      />
      <button className="button button-primary" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Sending sign-in link…" : "Send secure sign-in link"}
      </button>
      <div className="sign-in-divider" aria-hidden="true"><span />or<span /></div>
      <button className="button button-secondary" disabled={isGoogleSigningIn || isSubmitting} onClick={handleGoogleSignIn} type="button">
        {isGoogleSigningIn ? "Opening Google…" : "Continue with Google"}
      </button>
      {message ? <p className="form-message" role="status">{message}</p> : null}
    </form>
  );
}
