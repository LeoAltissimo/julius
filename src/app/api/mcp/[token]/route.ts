import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/server";

import { registerJuliusTools } from "@/lib/mcp/tools";

/**
 * The same MCP server, with the token in the path instead of a header.
 *
 * This exists for one reason: the connector form in the Claude phone and web
 * apps takes a URL and OAuth fields, and offers nowhere to put a header. A
 * token in the path is a step down from a header — URLs turn up in server logs
 * in a way that Authorization values do not — so it is the fallback, not the
 * default. It stays scoped to one person and revocable in a tap, and the
 * database still does the real check on every call.
 *
 * Anything that can send a header should use /api/mcp instead.
 */

const handler = createMcpHandler(registerJuliusTools, {
  serverInfo: { name: "julius", version: "1.0.0" },
  capabilities: { tools: { listChanged: false } },
});

async function verifyToken(
  request: Request,
  _bearerToken?: string,
): Promise<AuthInfo | undefined> {
  // A header still wins when one is present, so a client that can send both
  // does not get downgraded by using this URL.
  if (_bearerToken && _bearerToken.length >= 24) {
    return { token: _bearerToken, clientId: "julius-mcp", scopes: [] };
  }

  const match = new URL(request.url).pathname.match(/\/api\/mcp\/([^/?]+)/);
  const token = match ? decodeURIComponent(match[1]) : null;

  if (!token || token.length < 24) return undefined;

  return { token, clientId: "julius-mcp-url", scopes: [] };
}

const authHandler = withMcpAuth(handler, verifyToken, { required: true });

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
