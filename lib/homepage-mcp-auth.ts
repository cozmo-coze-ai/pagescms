import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessionTable, userTable } from "@/db/schema";
import { homepageOauthClient, homepageOauthConsent } from "@/db/homepage-oauth-schema";
import { homepageIssuer, getHomepageOAuth, homepageResource } from "@/lib/homepage-oauth";
import { getUserRole } from "@/lib/admin";
import { createHttpError } from "@/lib/api-error";

export function homepageAuthChallenge() {
  const origin = new URL(homepageResource()).origin;
  return `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource${new URL(homepageResource()).pathname}", scope="homepage:read homepage:write"`;
}

export async function authenticateHomepageMcp(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = /^Bearer ([^\s]+)$/i.exec(header)?.[1];
  const unauthorized = () => createHttpError("Connect your COZE CMS account to use the homepage editor.", 401, { "WWW-Authenticate": homepageAuthChallenge() });
  if (!token || token.length > 16_000) throw unauthorized();
  const { payload } = await getHomepageOAuth().api.verifyJWT({ body: { token, issuer: homepageIssuer() } });
  const scopes = typeof payload?.scope === "string" ? payload.scope.split(" ") : [];
  if (!payload || payload.aud !== homepageResource() || payload.iss !== homepageIssuer()
    || typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()
    || typeof payload.sub !== "string" || typeof payload.sid !== "string" || typeof payload.azp !== "string"
    || !scopes.includes("homepage:read")) throw unauthorized();

  // JWT signature alone is insufficient: logout, removed users, revoked
  // consent, disabled clients and role changes take effect on the next call.
  const [session] = await db.select({ id: sessionTable.id, userId: userTable.id, email: userTable.email })
    .from(sessionTable).innerJoin(userTable, eq(userTable.id, sessionTable.userId))
    .where(and(eq(sessionTable.id, payload.sid), eq(sessionTable.userId, payload.sub), gt(sessionTable.expiresAt, new Date()))).limit(1);
  const [client] = await db.select({ disabled: homepageOauthClient.disabled }).from(homepageOauthClient)
    .where(eq(homepageOauthClient.clientId, payload.azp)).limit(1);
  const consents = await db.select({ scopes: homepageOauthConsent.scopes }).from(homepageOauthConsent)
    .where(and(eq(homepageOauthConsent.clientId, payload.azp), eq(homepageOauthConsent.userId, payload.sub)));
  const consentScopes = new Set(consents.flatMap((c) => c.scopes));
  if (!session || !client || client.disabled || !consentScopes.has("homepage:read")) throw unauthorized();
  const role = await getUserRole({ id: session.userId, email: session.email });
  if (!role) throw unauthorized();
  return {
    userId: session.userId, email: session.email, sessionId: session.id,
    canWrite: role !== "viewer" && scopes.includes("homepage:write") && consentScopes.has("homepage:write"),
  };
}
