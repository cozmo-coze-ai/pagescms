import { authenticateHomepageMcp, homepageAuthChallenge } from "@/lib/homepage-mcp-auth";
import { homepageMcpBackend } from "@/lib/homepage-mcp-backend";
import { homepageMcpEnabled } from "@/lib/homepage-mcp-config";
import { homepageMcpResponse } from "@/lib/homepage-mcp-http";
import { getBaseUrl } from "@/lib/base-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  if (!homepageMcpEnabled()) return Response.json({ error: "Homepage plugin connection has not been activated." }, { status: 503 });
  const origin = request.headers.get("origin");
  if (origin && ![new URL(getBaseUrl()).origin, "https://chatgpt.com"].includes(origin)) return new Response(null, { status: 403 });
  try {
    const actor = await authenticateHomepageMcp(request);
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
    return await homepageMcpResponse(request, homepageMcpBackend(actor), actor.canWrite);
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 503;
    return Response.json({ error: status === 401 ? "Connect your COZE CMS account." : status === 413 ? "Request is too large." : "The COZE connection is temporarily unavailable." }, {
      status, headers: { "Cache-Control": "no-store", ...(status === 401 ? { "WWW-Authenticate": homepageAuthChallenge() } : {}) },
    });
  }
}
export { handle as POST, handle as GET, handle as DELETE };
