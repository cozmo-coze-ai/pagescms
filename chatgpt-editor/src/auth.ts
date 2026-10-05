import { AuthorizationError } from "@cloudflare/workers-oauth-provider";
import { callStore } from "./store.ts";
import { PublicError, cmsUser, member, sha256, type Env, type Member } from "./types.ts";
import { boundedText } from "./http.ts";

const escape = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const sessionCookieName = "__Host-coze_editor_session";
const sessionLifetimeSeconds = 7 * 24 * 60 * 60;

function sessionToken(request: Request) {
  const cookie = request.headers.get("cookie")?.split(";").map(part => part.trim())
    .find(part => part.startsWith(`${sessionCookieName}=`));
  const value = cookie?.slice(sessionCookieName.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
}

async function rememberedMember(request: Request, env: Env): Promise<{ member: Member; clientId: string } | undefined> {
  const token = sessionToken(request);
  if (!token) return undefined;
  const record = await env.OAUTH_KV.get(`coze:browser-session:${await sha256(token)}`);
  if (!record) return undefined;
  let stored: { id?: string; keyHash?: string; clientId?: string };
  try { stored = JSON.parse(record); } catch { return undefined; }
  const current = stored.id ? member(env, stored.id) : undefined;
  return current && current.keyHash === stored.keyHash && stored.clientId
    ? { member: current, clientId: stored.clientId } : undefined;
}

async function rememberMember(env: Env, current: Member, clientId: string, headers: Headers) {
  const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  await env.OAUTH_KV.put(`coze:browser-session:${await sha256(token)}`,
    JSON.stringify({ id: current.id, keyHash: current.keyHash, clientId }), { expirationTtl: sessionLifetimeSeconds });
  headers.append("Set-Cookie", `${sessionCookieName}=${token}; Max-Age=${sessionLifetimeSeconds}; Path=/; Secure; HttpOnly; SameSite=Lax`);
}

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
      consent.headers.set("Cache-Control", "no-store");
      const session = new URL(request.url).searchParams.has("switch") ? undefined : await rememberedMember(request, env);
      const remembered = session?.clientId === req.clientId ? session.member : undefined;
      const keyControl = remembered
        ? `<p>Signed in on this browser as <strong>${escape(remembered.name)}</strong>.</p><a href="${escape(new URL(request.url).toString() + (new URL(request.url).search ? "&" : "?") + "switch=1")}">Use a different COZE key</a>`
        : `<label>Your personal connection key<input name="key" type="password" autocomplete="off" required maxlength="200"></label>`;
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect COZE</title>
      <style>body{font:16px system-ui;background:#f8f7f2;color:#173d35;margin:0;padding:24px}main{max-width:420px;margin:8vh auto}h1{font-size:28px}input,button{box-sizing:border-box;width:100%;padding:14px;border:1px solid #aab6ad;border-radius:10px;margin:8px 0;font:inherit}button{background:#173d35;color:white;cursor:pointer}.secondary{background:transparent;color:#173d35}small{overflow-wrap:anywhere;display:block;margin:16px 0}</style></head><body><main>
      <h1>Connect your COZE content editor</h1><p>Edit the homepage and itineraries. Preview changes in chat. Publish only when you say yes.</p>
      <p>Connect to <strong>${escape(details.clientName)}</strong>.</p><small>${details.clientDomain ? `Client: ${escape(details.clientDomain)}. ` : "Client name is self-reported. "}Access returns to ${escape(details.redirectHost)}.${details.redirectIsLoopback ? " This connects an app on your computer." : ""}</small>
      <form method="post"><input type="hidden" name="handle" value="${escape(consent.handle)}">${keyControl}
      <small>Permissions: ${details.scope.map(escape).join(", ")}. Homepage design and CMS itineraries only.${remembered ? "" : " Use your existing personal COZE connection key. This browser will remember your sign-in for seven days."}</small>
      <button name="decision" value="approve">${remembered ? "Continue" : "Connect"}</button><button class="secondary" name="decision" value="deny" formnovalidate>Cancel</button></form></main></body></html>`;
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
    const key = form.get("key");
    const session = key ? undefined : await rememberedMember(request, env);
    const user = key
      ? await callStore(env, "", "login", { key, ip: request.headers.get("cf-connecting-ip") })
      : session?.member;
    if (!user) throw new PublicError("This browser sign-in expired. Start again from ChatGPT and enter your COZE key.", 401);
    const approved = await env.OAUTH_PROVIDER.approveConsent(request, handle);
    if (session && session.clientId !== approved.request.clientId) throw new PublicError("This browser sign-in belongs to another connection. Start again and enter your COZE key.", 403);
    if(approved.request.scope.some(s=>s.startsWith("itineraries:")) && !cmsUser(env,user.id)) throw new PublicError("Your connection is not enabled for CMS itineraries. Ask the COZE owner to grant access.",403);
    const granted = approved.request.scope.filter(s => ["homepage:read", "homepage:write", "itineraries:read", "itineraries:write", "offline_access"].includes(s));
    const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({ request: approved.request, userId: user.id, metadata: { name: user.name }, scope: granted, props: { userId: user.id } });
    approved.headers.set("Location", redirectTo);
    if (key) {
      const current = member(env, user.id);
      if (current) {
        try { await rememberMember(env, current, approved.request.clientId, approved.headers); }
        catch { console.error("COZE browser sign-in could not be remembered."); }
      }
    }
    return new Response(null, { status: 302, headers: approved.headers });
  } catch (e) {
    return new Response(e instanceof PublicError ? e.message : e instanceof AuthorizationError ? "This connection request expired or could not be verified. Start again from ChatGPT." : "Connection unavailable. Ask the COZE owner to check setup.", { status: e instanceof PublicError ? e.status : 400, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
  }
}
