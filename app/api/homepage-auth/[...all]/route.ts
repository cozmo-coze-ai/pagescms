import { getHomepageOAuth } from "@/lib/homepage-oauth";
import { homepageMcpEnabled, HOMEPAGE_AUTH_PATH } from "@/lib/homepage-mcp-config";
import { boundedText } from "@/lib/homepage-http";
import { getBaseUrl } from "@/lib/base-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const allowed: Record<string, string> = {
  "/oauth2/authorize": "GET", "/oauth2/token": "POST", "/oauth2/register": "POST",
  "/oauth2/consent": "POST", "/oauth2/revoke": "POST", "/jwks": "GET",
};

async function handle(request: Request) {
  if (!homepageMcpEnabled()) return Response.json({ error: "temporarily_unavailable", error_description: "Homepage plugin connection has not been activated." }, { status: 503 });
  const path = new URL(request.url).pathname.slice(HOMEPAGE_AUTH_PATH.length);
  if (allowed[path] !== request.method) return new Response(null, { status: 404 });
  if (path === "/oauth2/consent" && request.headers.get("origin") !== new URL(getBaseUrl()).origin) return new Response(null, { status: 403 });
  try {
    const input = request.method === "POST" ? new Request(request, { body: await boundedText(request, 16_000) }) : request;
    const response = await getHomepageOAuth().handler(input);
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("Referrer-Policy", "no-referrer");
    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    const tooLarge = error && typeof error === "object" && "status" in error && error.status === 413;
    return Response.json({ error: tooLarge ? "invalid_request" : "temporarily_unavailable" }, { status: tooLarge ? 413 : 503, headers: { "Cache-Control": "no-store" } });
  }
}
export { handle as GET, handle as POST };
