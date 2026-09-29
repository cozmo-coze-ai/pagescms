import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFile } from "node:fs/promises";
import { userTable, sessionTable, accountTable, verificationTable } from "../db/schema.ts";
import * as s from "../db/homepage-oauth-schema.ts";
import { createHomepageOAuth } from "./homepage-oauth-provider.ts";
import { HOMEPAGE_AUTH_PATH, HOMEPAGE_MCP_PATH } from "./homepage-mcp-config.ts";

const base = "https://cms.test";
const callback = "https://chatgpt.com/connector_platform_oauth_redirect";
const resource = `${base}${HOMEPAGE_MCP_PATH}`;

for (const storage of ["memory", "postgres"] as const) test(`real OAuth provider (${storage}): CMS login SSO, discovery, consent, PKCE, resource binding, replay and refresh`, async (t) => {
  const data: Record<string, Record<string, unknown>[]> = Object.fromEntries(["user", "session", "account", "verification", "oauthClient", "oauthResource", "oauthClientResource", "oauthRefreshToken", "oauthAccessToken", "oauthConsent", "oauthClientAssertion", "jwks"].map((model) => [model, []]));
  const secret = randomBytes(48).toString("base64url");
  let database = memoryAdapter(data);
  let postgres: PGlite | undefined;
  if (storage === "postgres") {
    postgres = new PGlite();
    t.after(() => postgres!.close());
    await postgres.exec(await readFile(new URL("../tests/fixtures/homepage-auth.sql", import.meta.url), "utf8"));
    // Execute the actual pending migration against isolated PostgreSQL, never
    // against .env, a Supabase project, or the live CMS.
    await postgres.exec(await readFile(new URL("../db/migrations/0023_homepage_plugin_oauth.sql", import.meta.url), "utf8"));
    database = drizzleAdapter(drizzle(postgres), { provider: "pg", schema: {
      user: userTable, session: sessionTable, account: accountTable, verification: verificationTable,
      oauthClient: s.homepageOauthClient, oauthResource: s.homepageOauthResource, oauthClientResource: s.homepageOauthClientResource,
      oauthRefreshToken: s.homepageOauthRefreshToken, oauthAccessToken: s.homepageOauthAccessToken,
      oauthConsent: s.homepageOauthConsent, oauthClientAssertion: s.homepageOauthClientAssertion, jwks: s.homepageOauthJwks,
    } });
  }
  const cmsLogin = betterAuth({ baseURL: base, secret, database, emailAndPassword: { enabled: true }, rateLimit: { enabled: false } });
  const login = await cmsLogin.api.signUpEmail({ body: { email: "editor@example.test", password: "Test-password-123!", name: "Test editor" }, asResponse: true });
  assert.equal(login.status, 200);
  const cookies = login.headers.getSetCookie().map((v) => v.split(";")[0]).join("; ");
  assert.ok(cookies);
  const signIn = await cmsLogin.api.signInEmail({ body: { email: "editor@example.test", password: "Test-password-123!" }, asResponse: true });
  assert.equal(signIn.status, 200, "CMS email/password login still works");
  const provider = createHomepageOAuth({ baseUrl: base, secret, database, enabled: () => true });
  const meta = await provider.api.getOAuthServerConfig();
  assert.equal(meta.issuer, `${base}${HOMEPAGE_AUTH_PATH}`);
  assert.ok(meta.code_challenge_methods_supported?.includes("S256"));
  assert.equal(meta.authorization_response_iss_parameter_supported, true);
  assert.ok(meta.registration_endpoint);
  const post = (path: string, body: Record<string, unknown>, cookie = "") => provider.handler(new Request(`${base}${HOMEPAGE_AUTH_PATH}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: base, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body),
  }));
  const registration = await post("/oauth2/register", { client_name: "COZE test", redirect_uris: [callback], token_endpoint_auth_method: storage === "postgres" ? "client_secret_post" : "none" });
  const client = await registration.json();
  assert.equal(registration.status, 201, JSON.stringify(client));
  assert.ok(client.client_id);
  const invalidRegistration = await post("/oauth2/register", { redirect_uris: ["https://evil.test/callback"], token_endpoint_auth_method: "none" });
  assert.equal(invalidRegistration.status, 400);
  const verifier = randomBytes(32).toString("base64url");
  const authorizeQuery = new URLSearchParams({ response_type: "code", client_id: client.client_id, redirect_uri: callback,
    scope: "homepage:read homepage:write offline_access", state: "test-state", resource,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
  const authorizeUrl = `${base}${HOMEPAGE_AUTH_PATH}/oauth2/authorize?${authorizeQuery}`;
  const signedOut = await provider.handler(new Request(authorizeUrl));
  assert.equal(signedOut.status, 302);
  assert.match(signedOut.headers.get("location") ?? "", /homepage-connect\/login/);
  const authorize = await provider.handler(new Request(authorizeUrl, { headers: { Cookie: cookies } }));
  assert.equal(authorize.status, 302, await authorize.clone().text());
  const consentUrl = new URL(authorize.headers.get("location")!, base);
  assert.equal(consentUrl.pathname, "/homepage-connect");
  const consent = await post("/oauth2/consent", { accept: true, oauth_query: consentUrl.search.slice(1) }, cookies);
  const consentBody = await consent.json();
  assert.equal(consent.status, 200, JSON.stringify(consentBody));
  const authorizedUrl = new URL(consentBody.url);
  assert.equal(authorizedUrl.origin, "https://chatgpt.com");
  assert.equal(authorizedUrl.searchParams.get("state"), "test-state");
  assert.equal(authorizedUrl.searchParams.get("iss"), meta.issuer);
  const code = authorizedUrl.searchParams.get("code");
  assert.ok(code);
  const exchange = (fields: Record<string, string>) => provider.handler(new Request(`${base}${HOMEPAGE_AUTH_PATH}/oauth2/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...fields, ...(client.client_secret ? { client_secret: client.client_secret } : {}) }),
  }));
  const grant = { grant_type: "authorization_code", code, client_id: client.client_id, redirect_uri: callback, code_verifier: verifier, resource };
  const wrongResource = await exchange({ ...grant, resource: "https://evil.test/mcp" });
  assert.equal(wrongResource.status, 400);
  const pair = await Promise.all([exchange(grant), exchange(grant)]);
  assert.deepEqual(pair.map((r) => r.status).sort(), [200, 400], "a code can be redeemed only once, even concurrently");
  // Use a fresh grant after intentionally detecting code replay: replay may
  // correctly revoke the tokens from the first redemption.
  const fresh = await provider.handler(new Request(`${authorizeUrl}&prompt=consent`, { headers: { Cookie: cookies } }));
  const freshConsent = await post("/oauth2/consent", { accept: true, oauth_query: new URL(fresh.headers.get("location")!, base).search.slice(1) }, cookies);
  const freshCode = new URL((await freshConsent.json()).url).searchParams.get("code")!;
  const response = await exchange({ ...grant, code: freshCode });
  const tokens = await response.json();
  assert.equal(response.status, 200, JSON.stringify(tokens));
  assert.ok(tokens.access_token); assert.ok(tokens.refresh_token);
  const { payload } = await provider.api.verifyJWT({ body: { token: tokens.access_token, issuer: meta.issuer } });
  assert.equal(payload?.aud, resource);
  assert.ok(payload?.sid); assert.ok(payload?.sub);
  assert.equal(payload?.scope, "homepage:read homepage:write offline_access");
  const serialized = JSON.stringify(postgres ? (await postgres.query("select * from cms_homepage_oauth_refresh_token")).rows : data);
  assert.equal(serialized.includes(tokens.refresh_token), false, "refresh tokens are stored hashed");
  const storedClients = JSON.stringify(postgres ? (await postgres.query("select * from cms_homepage_oauth_client")).rows : data.oauthClient);
  if (client.client_secret) assert.equal(storedClients.includes(client.client_secret), false, "client secrets are stored hashed");
  const refresh = await exchange({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: client.client_id, resource });
  const renewed = await refresh.json();
  assert.equal(refresh.status, 200, JSON.stringify(renewed));
  assert.notEqual(renewed.refresh_token, tokens.refresh_token);
  const reused = await exchange({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: client.client_id, resource });
  assert.equal(reused.status, 400, "used refresh tokens must not create another token family");
  if (postgres) {
    const tables = await postgres.query<{ relname: string; relrowsecurity: boolean }>("select relname, relrowsecurity from pg_class where relname like 'cms_homepage_oauth_%' and relkind = 'r'");
    assert.equal(tables.rows.length, 8);
    assert.ok(tables.rows.every((row) => row.relrowsecurity), "all private OAuth tables have RLS");
    await postgres.exec("create role homepage_test_reader; grant usage on schema public to homepage_test_reader; grant select on all tables in schema public to homepage_test_reader; set role homepage_test_reader");
    const hidden = await postgres.query("select * from cms_homepage_oauth_client");
    assert.equal(hidden.rows.length, 0, "even a granted API role cannot read private OAuth clients");
    await postgres.exec("reset role");
  }
});
