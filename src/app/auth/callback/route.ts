import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Where Supabase sends people back after they click a link in an email.
 *
 * The browser client uses the PKCE flow, so the link comes back carrying a
 * one-time `code` rather than a session. Without this handler the visitor lands
 * on a page with a code in the URL that nothing consumes, and stays signed out
 * having done everything right.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const code = searchParams.get("code");
  const next = searchParams.get("next");

  // Never bounce to another host on the strength of a query parameter.
  const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=invalid_code`);
  }

  return NextResponse.redirect(`${origin}${destination}`);
}
