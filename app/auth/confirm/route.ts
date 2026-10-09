import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

function safeNextPath(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = safeNextPath(searchParams.get("next"));
  redirectTo.search = "";

  const supabase = await createClient();
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("Missing sign-in confirmation details.") };

  if (!error) return NextResponse.redirect(redirectTo);

  redirectTo.pathname = "/login";
  redirectTo.searchParams.set("error", "sign-in-link");
  return NextResponse.redirect(redirectTo);
}
