import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals, the PWA shell files and static assets,
     * which must stay reachable while signed out or the app cannot install.
     *
     * `api/` is excluded too: the MCP endpoint authenticates with a bearer
     * token rather than a session cookie, so bouncing it to /login would break
     * it for exactly the callers it is built for.
     */
    "/((?!api/|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
