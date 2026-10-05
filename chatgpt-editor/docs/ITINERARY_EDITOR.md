# Itinerary extension — 2026-09-29

## Release and activation

Existing plugin [COZE Homepage & Itinerary Editor](https://chatgpt.com/plugins/plugin_ce7a0f7893008191a2b49a669dea575d) is **0.4.0**. All seven downloaded release files match the submitted bundle, preserving its canonical identity, original icon, three starter prompts, app attachment and audience. The supported app-server save/read APIs completed the update; Plugin Creator's direct update tool was not available in this session. The save response does not expose a separate release ID.

Same app: `asdk_app_6abb1da4205c81919a0468aee3675954`; its display name remains **COZE Homepage Editor**. Same OAuth endpoint: `https://coze-homepage-editor.cozmo-ca1.workers.dev/mcp`. Worker version **c97bf052-9ff3-4d47-9553-37988ec09677** is deployed from the unified repository's automatic Cloudflare build.

**Pending in the ChatGPT client:** refresh this existing developer app's tools and reconnect to approve `itineraries:read` / `itineraries:write`. The latest `app/read` metadata still showed seven homepage tools; the live server advertises 18 including new-itinerary preparation and component-only acknowledgements. The owner reported not finding Refresh tools. Do not create another app, claim the client has refreshed, or bypass consent. Start a new conversation after refresh. A real ChatGPT itinerary preview and approved production publication have not yet been verified.

Workspace sharing previously returned `Workspace plugin sharing permission required`. This update does not broaden sharing. Only the existing owner member is enabled for itinerary access. Each teammate needs a separate key, CMS identity mapping and appropriate CMS role.

## Workflow and safeguards

Existing: `listItineraries` → `getItinerary` → `prepareItineraryPreview` → `showItineraryPreview` → requester confirms exact preview → `publishItinerary` → `getItineraryChange`.

New: `listItineraries` collision check → optional `uploadItineraryPhoto` with `forNewItinerary:true` → `prepareNewItineraryPreview` → the same preview, confirmation, publication and status sequence.

Titles, category, tags, cover, Markdown body and publication state can change. Partial edit requests preserve omitted fields; addresses are immutable after creation. New itineraries require a unique lowercase kebab-case address and complete content, default to unpublished, and are inserted only after their exact private preview is shown and approved. Deleting itineraries or changing templates remains outside this release. Homepage file, executable-code and shared-copy restrictions remain unchanged; four languages move together for homepage copy. Existing itinerary text retains its language unless explicitly requested otherwise.

The preview shows exact proposed text and photos immediately in a responsive reading layout, omitting site navigation. It is **not a pixel-identical full public-page preview**. `uploadItineraryPhoto` accepts ChatGPT JPG/PNG/WebP attachments under 2 MB and at most 4000px; up to five per change. Photos remain private until confirmation. Preview capabilities stay in component-only metadata, require current CMS access, and expire after 24 hours. KV photo bytes expire after 48 hours; private draft metadata is retained in the Durable Object for retry/audit. A component acknowledgement proves the exact preview loaded, not that a human inspected every pixel or approved it. The skill must obtain an explicit yes; the boolean alone cannot prove conversation consent.

Publication checks both content revision and update timestamp, locks the row, checks current CMS role, and commits content, before/after audit versions and the existing deploy dirty marker atomically. Lost commit responses reconcile against that audit. The existing once-per-minute CMS cron starts the public build; no extra deploy-hook credential is needed. SQL timestamps are explicitly parsed as UTC to avoid local timezone errors.

`live` requires the exact published hash and a sufficiently recent content snapshot at `/cms-itinerary-versions.json`. `saved_draft` stays unpublished; `publishing` is not live; `superseded` means newer CMS content exists, not that it is live. Build failures and saves unconfirmed after ten minutes require attention. Do not retry publication merely to trigger another build.

## Runtime access

- Existing `TEAM_MEMBERS_JSON`, hashed keys, OAuth KV, GitHub/Cloudflare credentials and homepage preview infrastructure were preserved.
- New secret `ITINERARY_EDITORS_JSON` maps enabled OAuth members to existing CMS users. Owner `coze-owner` maps to Nishat's existing CMS user. Every operation reads current role: admin/editor writes, viewer reads.
- `CMS_DATABASE` uses existing verified-TLS Hyperdrive **7c1dba6c67504c1cadba6c0c8ed40458**, restricted `coze_cms_runtime` login and existing RLS policies. No production migration was run.
- Server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` support immutable uploads to `itineraries-media`. Existing storage objects are never overwritten. A subsequent content conflict can leave an unused immutable photo, without overwriting content.
- Protected credentials remain under `C:\Users\cozmo\.codex\credentials\coze-homepage-editor`, `coze-cloudflare` and `coze-cms`. Decrypt only into process memory. `scripts/copy-owner-connection-key.ps1` copies the existing connection key without printing it. Never share it with teammates or include values in Git/chat/plugin files.

## Verification

Passed: TypeScript; 27 backend/MCP tests; private photo staging/confirmation/ownership checks; SQL concurrency, rollback, role revocation, literal-search and audit tests; full-scope OAuth/PKCE/replay and Hyperdrive/pg in actual Workerd; local MCP Apps component at 320/390/768/1024/1440px; production dependency audit with zero findings.

Hosted check listed all 37 itineraries, read current content, prepared a private draft in **2.9 seconds** and rendered it at 320/390/1440px without horizontal overflow or uncaught JS errors. Confirmation false was rejected, preview capability checks passed and CMS content/timestamp stayed unchanged. Original homepage-only OAuth still works. No true publication or public photo upload was performed against production as a test. The component host tests were simulated, not real ChatGPT.

Public source commit **d5dc7cbd7cf6aa79d75098c000dbebf458102582** adds four files/changes for the generated manifest. Production build **cf591d61-ce50-45a3-a138-2a60c987ceac** passed in **129 seconds**, deploying public Worker version **4b2d77e5-25ea-4de0-a2dc-70a36d5dc289**. All 37 public hashes match Supabase and the connector's canonical serialization. These measured times are observations, not guarantees.

The local Windows prerender exited early; a Linux Docker attempt failed on the local Workerd connection. A non-main Cloudflare build lacked that trigger's Supabase secrets. These failed checks are not passes. The already configured production trigger then completed successfully. No build secrets were broadened to other branches. A temporary feature branch accidentally pushed to the personal mirror was removed; subsequent pushes used the explicit COZE production repository. The unrelated local preview commit `31b5b23` was excluded.

All 37 raw itineraries validate and render. One existing broken blob photo in `paju-healing-trip-special-autumn-and-winter-course` is flagged and shown as a placeholder, preserved until the requester explicitly replaces/removes it. New broken references are rejected. No old content was automatically repaired or republished.

## Reproduction and rollback

Run `npm run check`, `npm test`, `npm run test:widget`, and `node --experimental-transform-types test/itinerary-widget.mjs`.

For SQL/runtime tests use disposable PostgreSQL 15 at `127.0.0.1:55441`, database `coze_itinerary_test`, with synthetic credentials only in `CMS_TEST_DATABASE_URL`. Run `node --experimental-transform-types test/itinerary-database.mjs`, then `npm run test:runtime`. Tests refuse other hosts/databases. Remove the disposable container afterward. Without that variable, runtime tests retain the original homepage-only OAuth regression.

For hosted read/private-preview checks, pass the protected owner key as `COZE_OWNER_CONNECTION_KEY` to `node scripts/verify-hosted-itineraries.mjs`. It never publishes with true and revokes its test OAuth grant. Generated reports/screenshots are excluded from Git.

Canonical connector/plugin source: [pagescms main, chatgpt-editor](https://github.com/cozmo-coze-ai/pagescms/tree/main/chatgpt-editor). The existing Worker has a separate Cloudflare Git build rooted at `/chatgpt-editor`, restricted to `main`. It checks types, tests and bundles before deploying. Root CMS builds exclude editor-only changes. The original [coze_cms feature/itinerary-plugin](https://github.com/cozmo-coze-ai/coze_cms/tree/feature/itinerary-plugin) remains a historical backup. Local `npm run build` is still a dry run. For current build verification see [the shared handoff](../../docs/CHATGPT_EDITOR_HANDOFF.md).

Pre-extension Worker rollback: **517b79ba-7b55-494c-a485-6e0e3ce89034**. No schema rollback is needed; retain saved audit/content. If reverting tools, restore matching old plugin instructions. The harmless public manifest can remain. CMS migration source is `C:\COZE_CORP\pagescms-cloudflare-release`; do not activate the old CMS-hosted MCP prototype or `0023_homepage_plugin_oauth.sql`.

References: [OpenAI tool refresh](https://developers.openai.com/plugins/deploy/connect-chatgpt), [file inputs and preview metadata](https://developers.openai.com/plugins/reference), [OAuth scopes](https://developers.openai.com/plugins/build/auth), [Hyperdrive with pg](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/node-postgres/).
