import { betterAuth, type BetterAuthOptions } from "better-auth";
import { jwt } from "better-auth/plugins";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { oauthProvider } from "@better-auth/oauth-provider";
import { allowedChatGptRedirect, HOMEPAGE_AUTH_PATH, HOMEPAGE_MCP_PATH, HOMEPAGE_SCOPES } from "./homepage-mcp-config.ts";

export function createHomepageOAuth(options: { baseUrl: string; secret: string; database: BetterAuthOptions["database"]; enabled: () => boolean }) {
  const resource = `${new URL(options.baseUrl).origin}${HOMEPAGE_MCP_PATH}`;
  const issuer = `${new URL(options.baseUrl).origin}${HOMEPAGE_AUTH_PATH}`;
  return betterAuth({
    baseURL: options.baseUrl, basePath: HOMEPAGE_AUTH_PATH, secret: options.secret,
    advanced: { cookiePrefix: "better-auth" }, database: options.database,
    hooks: { before: createAuthMiddleware(async (ctx) => {
      if (!options.enabled()) throw new APIError("SERVICE_UNAVAILABLE", { message: "Homepage plugin connection has not been activated." });
      if (ctx.path === "/oauth2/register") {
        const body = ctx.body ?? {};
        if (!Array.isArray(body.redirect_uris) || !body.redirect_uris.length || !body.redirect_uris.every(allowedChatGptRedirect)) {
          throw new APIError("BAD_REQUEST", { error: "invalid_redirect_uri", message: "Use the exact ChatGPT connection callback URL." });
        }
        body.grant_types = ["authorization_code", "refresh_token"];
        body.response_types = ["code"];
      }
      if (ctx.path === "/oauth2/authorize") {
        if (!allowedChatGptRedirect(ctx.query?.redirect_uri) || ctx.query?.code_challenge_method !== "S256" || !ctx.query?.code_challenge) {
          throw new APIError("BAD_REQUEST", { error: "invalid_request", message: "A ChatGPT callback and PKCE S256 are required." });
        }
        if (ctx.query?.resource !== resource) throw new APIError("BAD_REQUEST", { error: "invalid_target" });
      }
      if (ctx.path === "/oauth2/token" && ctx.body?.resource !== resource) throw new APIError("BAD_REQUEST", { error: "invalid_target" });
    }) },
    plugins: [
      jwt({ jwt: { issuer, audience: resource, expirationTime: "5m" } }),
      oauthProvider({
        loginPage: "/homepage-connect/login", consentPage: "/homepage-connect",
        scopes: HOMEPAGE_SCOPES,
        resources: [{ identifier: resource, name: "COZE Homepage", allowedScopes: HOMEPAGE_SCOPES, accessTokenTtl: 300 }],
        clientRegistrationDefaultResources: [resource], enforcePerClientResources: true,
        grantTypes: ["authorization_code", "refresh_token"],
        allowDynamicClientRegistration: true, allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultScopes: HOMEPAGE_SCOPES, clientRegistrationRequirePKCE: true,
        accessTokenExpiresIn: 300, codeExpiresIn: 120, refreshTokenExpiresIn: 60 * 60 * 24 * 7,
        storeTokens: "hashed", storeClientSecret: "hashed",
        clientPrivileges: async () => false, resourcePrivileges: async () => false,
        silenceWarnings: { oauthAuthServerConfig: true },
      }),
    ],
  });
}
