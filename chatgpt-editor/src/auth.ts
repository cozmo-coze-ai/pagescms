import { AuthorizationError } from "@cloudflare/workers-oauth-provider";
import { callStore } from "./store.ts";
import { PublicError, cmsUser, type Env } from "./types.ts";
import { boundedText } from "./http.ts";

const escape = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
export async function authorize(request: Request, env: Env) {
  try {
    if (request.method === "GET") {
      const req = await env.OAUTH_PROVIDER.parseAuthRequest(request);
      // Require PKCE even for confidential clients.
      if (!req.codeChallenge || req.codeChallengeMethod !== "S256") throw new PublicError("Reconnect with a client supporting PKCE S256.");
      const details = await env.OAUTH_PROVIDER.describeConsent(req);
      const consent = await env.OAUTH_PROVIDER.beginConsent(req);
      consent.headers.set("Content-Type", "text/html; charset=utf-8");
      // no-referrer makes browsers send Origin: null for a native form POST,
      // which our same-origin CSRF check correctly rejects. Keep the origin
      // while withholding the authorization query from Referer headers.
      consent.headers.set("Referrer-Policy", "strict-origin");
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect COZE</title>
      <style>body{font:16px system-ui;background:#f8f7f2;color:#173d35;margin:0;padding:24px}main{max-width:420px;margin:8vh auto}h1{font-size:28px}input,button{box-sizing:border-box;width:100%;padding:14px;border:1px solid #aab6ad;border-radius:10px;margin:8px 0;font:inherit}button{background:#173d35;color:white;cursor:pointer}.secondary{background:transparent;color:#173d35}small{overflow-wrap:anywhere;display:block;margin:16px 0}</style></head><body><main>
      <h1>Connect your COZE content editor</h1><p>Edit the homepage and itineraries. Preview changes in chat. Publish only when you say yes.</p>
      <p>Connect to <strong>${escape(details.clientName)}</strong>.</p><small>${details.clientDomain ? `Client: ${escape(details.clientDomain)}. ` : "Client name is self-reported. "}Access returns to ${escape(details.redirectHost)}.${details.redirectIsLoopback ? " This connects an app on your computer." : ""}</small>
      <form method="post"><input type="hidden" name="handle" value="${escape(consent.handle)}"><label>Your personal connection key<input name="key" type="password" autocomplete="off" required maxlength="200"></label>
      <small>Permissions: ${details.scope.map(escape).join(", ")}. Homepage design and CMS itineraries only. Use your existing personal COZE connection key.</small>
      <button name="decision" value="approve">Connect</button><button class="secondary" name="decision" value="deny" formnovalidate>Cancel</button></form></main></body></html>`;
      return new Response(html, { headers: consent.headers });
    }
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    if (request.headers.get("origin") !== env.PUBLIC_ORIGIN) return new Response("Invalid sign-in origin", { status: 403 });
    const text = await boundedText(request, 4096);
    const form = new URLSearchParams(text); const handle = form.get("handle") || "";
    if (form.get("decision") !== "approve") {
      const denied = await env.OAUTH_PROVIDER.denyConsent(request, handle);
      return new Response(null, { status: 302, headers: denied.headers });
    }
    const user = await callStore(env, "", "login", { key: form.get("key") || "", ip: request.headers.get("cf-connecting-ip") });
    const approved = await env.OAUTH_PROVIDER.approveConsent(request, handle);
    if(approved.request.scope.some(s=>s.startsWith("itineraries:")) && !cmsUser(env,user.id)) throw new PublicError("Your connection is not enabled for CMS itineraries. Ask the COZE owner to grant access.",403);
    const granted = approved.request.scope.filter(s => ["homepage:read", "homepage:write", "itineraries:read", "itineraries:write", "offline_access"].includes(s));
    const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({ request: approved.request, userId: user.id, metadata: { name: user.name }, scope: granted, props: { userId: user.id } });
    approved.headers.set("Location", redirectTo);
    return new Response(null, { status: 302, headers: approved.headers });
  } catch (e) {
    return new Response(e instanceof PublicError ? e.message : e instanceof AuthorizationError ? "This connection request expired or could not be verified. Start again from ChatGPT." : "Connection unavailable. Ask the COZE owner to check setup.", { status: e instanceof PublicError ? e.status : 400, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
  }
}
