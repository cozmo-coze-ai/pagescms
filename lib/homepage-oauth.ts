import "server-only";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import { userTable, sessionTable, accountTable, verificationTable } from "@/db/schema";
import * as s from "@/db/homepage-oauth-schema";
import { getBaseUrl } from "@/lib/base-url";
import { createHttpError } from "@/lib/api-error";
import { createHomepageOAuth } from "@/lib/homepage-oauth-provider";
import { HOMEPAGE_AUTH_PATH, HOMEPAGE_MCP_PATH, homepageMcpEnabled } from "@/lib/homepage-mcp-config";

export const homepageResource = () => `${new URL(getBaseUrl()).origin}${HOMEPAGE_MCP_PATH}`;
export const homepageIssuer = () => `${new URL(getBaseUrl()).origin}${HOMEPAGE_AUTH_PATH}`;
let provider: ReturnType<typeof createHomepageOAuth> | undefined;

// Lazy initialization: importing disabled routes or building the CMS must
// never seed resources, generate signing keys or touch production records.
export function getHomepageOAuth() {
  if (!homepageMcpEnabled()) throw createHttpError("Homepage plugin connection has not been activated.", 503);
  return provider ??= createHomepageOAuth({
    baseUrl: getBaseUrl(), secret: process.env.AUTH_SECRET || process.env.BETTER_AUTH_SECRET || "", enabled: homepageMcpEnabled,
    database: drizzleAdapter(db, { provider: "pg", schema: {
      user: userTable, session: sessionTable, account: accountTable, verification: verificationTable,
      oauthClient: s.homepageOauthClient, oauthResource: s.homepageOauthResource, oauthClientResource: s.homepageOauthClientResource,
      oauthRefreshToken: s.homepageOauthRefreshToken, oauthAccessToken: s.homepageOauthAccessToken,
      oauthConsent: s.homepageOauthConsent, oauthClientAssertion: s.homepageOauthClientAssertion, jwks: s.homepageOauthJwks,
    } }),
  });
}
