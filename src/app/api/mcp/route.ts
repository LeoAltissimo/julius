import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/server";

import { registerJuliusTools } from "@/lib/mcp/tools";

/**
 * The MCP endpoint for clients that can send an Authorization header: Claude
 * Code, Claude Desktop, and anything else driven by a config file.
 *
 * Phone apps configure connectors through a form that offers OAuth fields and
 * no place for a header, so they use the sibling route that carries the token
 * in the path instead.
 */

const handler = createMcpHandler(registerJuliusTools, {
  serverInfo: { name: "julius", version: "1.0.0" },
  capabilities: { tools: { listChanged: false } },
});

/**
 * The shape check happens here; the real authorisation happens in the database
 * on every single call, because that is where the token can actually be
 * compared against a hash. Getting past this point buys an agent nothing.
 */
async function verifyToken(
  _request: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken || bearerToken.length < 24) return undefined;
  return { token: bearerToken, clientId: "julius-mcp", scopes: [] };
}

const authHandler = withMcpAuth(handler, verifyToken, { required: true });

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
