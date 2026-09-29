export const HOMEPAGE_MCP_PATH = "/api/agent/homepage/mcp";
export const HOMEPAGE_AUTH_PATH = "/api/homepage-auth";
export const HOMEPAGE_SCOPES = ["homepage:read", "homepage:write", "offline_access"];

export function homepageMcpEnabled() {
  return process.env.COZE_HOMEPAGE_MCP_ENABLED === "true";
}

export function allowedChatGptRedirect(value: unknown) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.origin === "https://chatgpt.com" && !url.username && !url.password && !url.search && !url.hash
      && (url.pathname === "/connector_platform_oauth_redirect" || /^\/connector\/oauth\/[a-zA-Z0-9_-]+$/.test(url.pathname));
  } catch { return false; }
}

// Only these OAuth protocol endpoints are exempt from browser Origin checks.
// Consent still requires the CMS's own Origin and its signed login session.
export function isHomepageOAuthProtocolPath(path: string) {
  return ["/oauth2/token", "/oauth2/register", "/oauth2/revoke"].some((suffix) => path === `${HOMEPAGE_AUTH_PATH}${suffix}`);
}
