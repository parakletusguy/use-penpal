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
