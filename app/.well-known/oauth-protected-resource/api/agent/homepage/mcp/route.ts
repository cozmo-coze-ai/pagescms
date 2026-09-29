import { homepageIssuer, homepageResource } from "@/lib/homepage-oauth";
import { HOMEPAGE_SCOPES, homepageMcpEnabled } from "@/lib/homepage-mcp-config";

export const dynamic = "force-dynamic";
export async function GET() {
  if (!homepageMcpEnabled()) return Response.json({ error: "Homepage plugin connection has not been activated." }, { status: 503 });
  return Response.json({ resource: homepageResource(), authorization_servers: [homepageIssuer()], scopes_supported: HOMEPAGE_SCOPES, bearer_methods_supported: ["header"] }, { headers: { "Cache-Control": "no-store" } });
}
