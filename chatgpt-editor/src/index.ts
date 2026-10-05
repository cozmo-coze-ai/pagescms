import OAuthProvider, { insufficientScope, type OAuthResourceContext } from "@cloudflare/workers-oauth-provider";
import { authorize } from "./auth.ts";
import { callStore } from "./store.ts";
import { mcpResponse } from "./mcp.ts";
import { member, PublicError, type Env } from "./types.ts";
import widget from "./widget.generated.ts";
import { previewAsset } from "./preview-assets.generated.ts";
export { EditorStore } from "./store.ts";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.origin !== env.PUBLIC_ORIGIN || !env.PUBLIC_ORIGIN.startsWith("https://") || env.PUBLIC_ORIGIN.endsWith(".invalid")) return new Response("Connection setup is incomplete.", { status: 503 });
    const itineraryPreview = /^\/itinerary-preview\/([a-f0-9-]{36})(?:\/([a-f0-9-]{36}))?$/.exec(url.pathname);
    if(itineraryPreview) {
      if(request.method!=="GET") return new Response("Method not allowed",{status:405});
      const token=url.searchParams.get("token")??"";
      if(!/^[a-f0-9-]{36}$/.test(token)) return new Response("Not found",{status:404});
      const stub=env.EDITOR.get(env.EDITOR.idFromName("homepage"));
      return stub.fetch(new Request("https://editor.internal/",{method:"POST",body:JSON.stringify({method:"itinerary:preview",input:{changeId:itineraryPreview[1],photoId:itineraryPreview[2],token}})}));
    }
    if (url.pathname === previewAsset.pathname && (request.method === "GET" || request.method === "HEAD")) return new Response(request.method === "HEAD" ? null : previewAsset.script, { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
    if (url.pathname === "/health") return Response.json({ service: "COZE Homepage & Itinerary Editor", configured: Boolean(env.GITHUB_TOKEN && env.CF_API_TOKEN && env.PREVIEW_WORKER_TAG && env.TEAM_MEMBERS_JSON), itinerariesConfigured: Boolean(env.CMS_DATABASE && env.ITINERARY_EDITORS_JSON) });
    const provider = new OAuthProvider<Env>({
      apiRoute: "/mcp", authorizeEndpoint: "/authorize", tokenEndpoint: "/oauth/token", clientRegistrationEndpoint: "/oauth/register",
      accessTokenTTL: 900, refreshTokenTTL: 2_592_000, clientIdMetadataDocumentEnabled: true,
      scopesSupported: ["homepage:read", "homepage:write", "itineraries:read", "itineraries:write", "offline_access"], requiredScopes: ["homepage:read"],
      resourceMetadata: { resource: `${env.PUBLIC_ORIGIN}/mcp`, authorization_servers: [env.PUBLIC_ORIGIN] },
      apiHandler: { async fetch(req, bindings, authCtx) {
        const authenticated = authCtx as OAuthResourceContext<{ userId: string }>;
        if (new URL(req.url).pathname !== "/mcp") return new Response("Not found", { status: 404 });
        const actor = (authCtx.props as { userId?: string })?.userId;
        if (!actor || !member(bindings, actor)) return new Response("Team access removed.", { status: 403 });
        if (!authenticated.auth.scope.some(s=>["homepage:read","itineraries:read"].includes(s))) return insufficientScope(authenticated.auth, ["homepage:read"]);
        try {
          return await mcpResponse(req, (method, input) => {
            if(!method.startsWith("itinerary:") && !authenticated.auth.scope.includes("homepage:read")) throw new PublicError("Reconnect with homepage read access.",403);
            return callStore(bindings, actor, method, input);
          }, authenticated.auth.scope.includes("homepage:write") && authenticated.auth.scope.includes("homepage:read"), widget,
            [`https://*.${bindings.PREVIEW_HOST_SUFFIX}`], {enabled:true,scopes:authenticated.auth.scope,resourceMetadata:`${bindings.PUBLIC_ORIGIN}/.well-known/oauth-protected-resource/mcp`,previewOrigin:bindings.PUBLIC_ORIGIN});
        } catch (e) { return Response.json({ error: e instanceof PublicError ? e.message : "Connection temporarily unavailable." }, { status: e instanceof PublicError ? e.status : 503 }); }
      } },
      defaultHandler: { async fetch(req, bindings) {
        if (new URL(req.url).pathname === "/authorize") return authorize(req, bindings);
        return new Response("COZE Homepage & Itinerary Editor. Connect using /mcp with OAuth.", { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
      } },
    });
    return provider.fetch(request, env, ctx);
  },
};
