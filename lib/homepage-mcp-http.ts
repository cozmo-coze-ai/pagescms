import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createHomepageMcpServer, type HomepageMcpBackend } from "./homepage-mcp-server.ts";
import { boundedText } from "./homepage-http.ts";

// Authentication is performed by the route before constructing this transport.
// Each request is independent, so Vercel instances never need sticky sessions.
export async function homepageMcpResponse(request: Request, backend: HomepageMcpBackend, canWrite: boolean) {
  const body = await boundedText(request, 400_000);
  const server = createHomepageMcpServer(backend, canWrite);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(new Request(request, { body }));
    const content = await response.text();
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(content || null, { status: response.status, headers });
  } finally { await server.close(); }
}
