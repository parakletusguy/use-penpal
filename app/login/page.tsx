import { redirect } from "next/navigation";
import { BrandName } from "@/components/brand-name";
import { createClient } from "@/utils/supabase/server";
import { SignInForm } from "./sign-in-form";

export default async function LoginPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const signedInEmail = typeof claimsData?.claims?.email === "string" ? claimsData.claims.email.toLowerCase() : null;
  const allowedEmail = process.env.PENPAL_EDITOR_EMAIL?.trim().toLowerCase();

  if (claimsData?.claims && signedInEmail === allowedEmail) redirect("/");

  if (claimsData?.claims) {
    return (
      <main className="auth-shell">
        <section className="auth-panel" aria-labelledby="access-heading">
          <p className="brand"><BrandName /></p>
          <p className="eyebrow">Editor access</p>
          <h1 id="access-heading">This workspace is reserved for its configured editor.</h1>
          <p>Sign out, then use the editor email that was set up for this PenPal workspace.</p>
          <form action="/auth/signout" method="post"><button className="button button-primary" type="submit">Sign out</button></form>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="sign-in-heading">
        <p className="brand"><BrandName /></p>
        <p className="eyebrow">Editor sign in</p>
        <h1 id="sign-in-heading">Your editorial workspace is ready.</h1>
        <p>Enter your email address and we&apos;ll send a secure one-time sign-in link.</p>
        <SignInForm />
      </section>
    </main>
  );
}
