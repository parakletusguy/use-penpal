import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export async function requireEditor() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const editorId = typeof claims?.sub === "string" ? claims.sub : null;
  const email = typeof claims?.email === "string" ? claims.email.toLowerCase() : null;
  const allowedEmail = process.env.PENPAL_EDITOR_EMAIL?.trim().toLowerCase();

  if (error || !editorId) redirect("/login");
  if (!allowedEmail || email !== allowedEmail) redirect("/login?access=denied");

  return { editorId, email, supabase };
}

export async function requireAuthor() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const ownerId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  const email = typeof data?.claims?.email === "string" ? data.claims.email.toLowerCase() : null;

  if (error || !ownerId) redirect("/login");

  return { email, ownerId, supabase };
}
