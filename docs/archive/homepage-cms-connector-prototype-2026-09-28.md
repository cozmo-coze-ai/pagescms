# COZE Homepage Editor connection

Prepared 2026-09-28. The CMS connection and plugin update are implemented and tested locally. **They have not been deployed or published to ChatGPT.** Keep the CMS on Vercel; the Cloudflare migration remains postponed.

## What connects

ChatGPT plugin → HTTPS MCP endpoint → individual COZE CMS sign-in → existing homepage guard/check/apply pipeline → GitHub → the existing Cloudflare Git build.

Endpoint after activation: `https://cms.coze.care/api/agent/homepage/mcp`.

This uses OAuth with PKCE and dynamic client registration. Team members use their own invited CMS accounts. No personal API key is pasted into chat, copied into the plugin, or shared between people. Installation does not complete sign-in or workspace sharing.

The prepared update is in `plugins/gpt-96a7a163626e05f4185de181791ba82a/`. The package name and three conversation starters are preserved from the installed skill. The connection and confirmation instructions are updated. Its COZE icon is copied unchanged from `coze_client/public/coze-brand/coze-icon-512.png`.

The ZIP is `.codex/coze-homepage-editor-plugin.zip` (generated and ignored by Git). It contains only that plugin directory. The package name is not a verified remote plugin ID. Update the existing plugin once its editable record is available; do not create duplicates.

## Activation, in order

These are pending operations, not actions performed by the local test suite.

1. **Restore homepage GitHub access in CMS.** The live authenticated read returns 503, `Homepage GitHub integration is not configured.` Set `COZE_CLIENT_GITHUB_TOKEN` in the CMS hosting environment using a fine-grained GitHub credential restricted to `cozmo-coze-ai/coze_client`: Contents read/write, Checks read, repository metadata read. Do not put it in chat or a plugin. Keep the current repo, branch and public URL unless intentionally using a preview.
2. **Review and release the CMS changes.** Test the upgraded Better Auth login, invited-user creation, reset-password and existing editor forms in a preview. Before upgrading, check for duplicate `(provider_id, account_id)` rows in the existing `account` table; resolve any duplicates deliberately. The migration only adds eight private OAuth tables with RLS; it does not rewrite existing accounts or content.
3. **Apply migration 0023 to the verified target CMS database.** Use the existing Drizzle migration workflow and a backup. `npm run build` has a migration postbuild; do not run it as a harmless check. The local build used `npx next build` with synthetic database settings. Check the CMS database role can access the new tables; browser/anonymous roles must not.
4. **Activate the connection in that deployment.** Set `COZE_HOMEPAGE_MCP_ENABLED=true`, with canonical `BASE_URL=https://cms.coze.care` and the existing stable auth secret (at least 32 characters). Verify the discovery URLs below return metadata and the unauthenticated MCP endpoint returns **401 plus WWW-Authenticate**, not 404/503. Invite editors through the existing CMS team page; viewers cannot publish.
5. **Connect and test in ChatGPT.** Use the documented developer-mode connection setup available to the account/workspace: add the MCP URL above, choose OAuth, and leave client credentials empty when dynamic registration is offered. Sign in to COZE CMS and approve consent. If the workspace prevents adding connections, its owner/admin must enable the feature. Do not select API Key/Bearer for MCP.
6. **Update the existing plugin.** Give Plugin Creator the ZIP and ask it to update the existing COZE Homepage Editor with this MCP connection, preserving its remote identity and unrelated connections. No hosted plugin update was saved here because create/update tools are unavailable in this session. Complete the publishing/sharing controls in the intended COZE workspace after connection testing. Each person signs in to their own CMS account.
7. **Test reads before publishing.** Use the first prompt below. After it returns the correct repo/commit, check a small mobile spacing edit and confirm no write before approval. Exercise publish, live-status verification and undo against a preview branch/site first. Verify the production Cloudflare Git build and `coze-build` marker before setting `COZE_CLIENT_CLOUDFLARE_GIT_DEPLOY_ENABLED=true` for main. This switch remains a separate publication prerequisite.

Discovery URLs:

- `https://cms.coze.care/.well-known/oauth-protected-resource/api/agent/homepage/mcp`
- `https://cms.coze.care/.well-known/oauth-authorization-server/api/homepage-auth`

First chat prompt:

> Connect to COZE and show the current homepage URL, commit and editable files. Do not change or publish anything.

First design prompt after a successful read:

> Make the homepage hero more compact at 320px and 390px. Keep our colors, text and desktop layout. Check the proposal and show me what would change. Do not publish yet.

## Safeguards and limits

- Exactly seven homepage tools. Existing file allowlist, locked shared copy, four-language checks and stale-commit protection apply unchanged.
- Publishing requires `confirmedByUser:true`, editor permission, and a signed 15-minute check receipt bound to the exact proposal, image bytes, commit and CMS user/session. Changed proposals need another check and fresh approval. Undo requires separate confirmation.
- A boolean or receipt cannot independently prove what a human said. Plugin instructions and ChatGPT's write-action approval controls must obtain approval. The server verifies permission, the boolean and exact checked content.
- JWT access tokens last five minutes. Refresh tokens and OAuth client secrets are stored hashed; refresh tokens rotate. Logout, account removal, disabled clients and removed consent are checked on every MCP call. Revoking only a refresh token stops renewal; an issued JWT can remain usable for its remaining five-minute lifetime. Disable the client or remove the session/consent for immediate denial.
- `getHomepageChange` must report `build.state: live` before success is claimed. A Cloudflare deployment and real ChatGPT browser sign-in have not been exercised by local tests.
- Photos require an actual supported attachment reference supplied by the host. Arbitrary website image URLs are not accepted. Test attachments in the real ChatGPT connection before promising photo support to the team.
- Disable `COZE_HOMEPAGE_MCP_ENABLED` to shut off the new routes. Preserve database tables and the old auth secret when rolling back; do not delete unrelated CMS data.

## Verification

Run `npm run test:homepage`, `npm run test:homepage-mcp`, `npx tsc --noEmit`, and `npm run lint`. New tests use memory and isolated PostgreSQL (PGlite), including actual migration 0023, real OAuth grants, public/confidential clients, concurrent code replay, resource binding, refresh rotation, RLS and SDK Streamable HTTP transport. No production database is used.

Auth and form dependencies were updated for the supported OAuth provider. Existing Zod 3 application schemas explicitly import `zod/v3` to retain parsing behavior. The form resolver supports both versions. Test existing CMS flows in preview before release.

Official references: [OpenAI authentication](https://developers.openai.com/plugins/build/auth), [connect and test a plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt), [plugin packaging](https://developers.openai.com/plugins/build/plugins), [Better Auth upgrade requirements](https://better-auth.com/docs/guides/1-7-upgrade-guide).
