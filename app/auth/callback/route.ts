import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

/** Exchanges the magic-link code for a session, then redirects to the dashboard. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Supabase appends error_description when the link itself is bad (expired, used).
  const linkError = searchParams.get("error_description");

  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/dashboard`);
    return loginWithError(origin, error.message);
  }
  return loginWithError(origin, linkError ?? "No sign-in code in the link.");
}

function loginWithError(origin: string, message: string) {
  const url = new URL("/login", origin);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}
