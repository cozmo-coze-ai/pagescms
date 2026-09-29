import { getHomepageOAuth } from "@/lib/homepage-oauth";
import { homepageMcpEnabled } from "@/lib/homepage-mcp-config";

export const dynamic = "force-dynamic";
export async function GET() {
  if (!homepageMcpEnabled()) return Response.json({ error: "Homepage plugin connection has not been activated." }, { status: 503 });
  const config = await getHomepageOAuth().api.getOAuthServerConfig();
  // Do not advertise provider endpoints blocked by our public route allowlist.
  const metadata = { ...config } as Record<string, unknown>;
  for (const key of ["userinfo_endpoint", "introspection_endpoint", "introspection_endpoint_auth_methods_supported", "introspection_endpoint_auth_signing_alg_values_supported", "end_session_endpoint", "pushed_authorization_request_endpoint", "device_authorization_endpoint", "backchannel_authentication_endpoint"]) delete metadata[key];
  return Response.json(metadata, { headers: { "Cache-Control": "no-store" } });
}
