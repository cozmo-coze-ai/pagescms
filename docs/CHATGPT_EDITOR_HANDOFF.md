# ChatGPT editor handoff — 2026-09-29

## Current connection

**Canonical source:** CMS and the complete ChatGPT connector now belong to `cozmo-coze-ai/pagescms/main`. The CMS is at the repository root; the independent connector and plugin bundle are in [`chatgpt-editor/`](../chatgpt-editor/). Source imported from the verified standalone commit `91eb8d07fb58d655a2f0d445f29161ea8293ccbe`. Each Worker has its own Cloudflare Git build. Existing domains, OAuth state, database access and runtime secrets are preserved.

The local `pagescms` checkout was synchronized with production main after all 92 mixed prototype files were backed up and verified. That obsolete prototype is not required by either live Worker. The original snapshot remains on `backup/cms-editor-work-20260929`, in Git stash, and in the owner's protected local backup folder.

- Workflow plugin: [COZE Homepage & Itinerary Editor](https://chatgpt.com/plugins/plugin_ce7a0f7893008191a2b49a669dea575d), version **0.4.0**, saved and read back with all seven release files verified.
- Required connected app: `asdk_app_6abb1da4205c81919a0468aee3675954`.
- OAuth MCP endpoint: `https://coze-homepage-editor.cozmo-ca1.workers.dev/mcp`.
- The same-name workflow plugin and connected app are both needed.

The same connection now supports homepage design and existing CMS itinerary content with separate tools/scopes. Both require the requester's explicit yes after the exact preview; no separate admin reviewer. The existing homepage safeguards remain.

**ChatGPT activation pending:** open [the existing app](https://chatgpt.com/plugins/plugin_asdk_app_6abb1da4205c81919a0468aee3675954), choose **Manage app → Refresh tools**, then reconnect if asked to approve `itineraries:read` / `itineraries:write`. The owner has located this menu; the latest metadata check still listed seven old homepage tools. Start a new chat after refreshing. Do not create another same-name app or bypass consent. A complete itinerary preview/publication through the real ChatGPT client is not yet verified.

Workspace sharing previously returned `Workspace plugin sharing permission required`. Do not claim company-wide availability or retry sharing until the permission has changed. Each teammate needs a separate connection; do not share the owner's credentials.

## Itineraries

The CMS is on Cloudflare using existing Supabase data. The standalone connector now binds the same verified-TLS Hyperdrive and restricted CMS login. No production migration or test-content publication was performed.

Legacy itinerary REST routes exist under `app/api/agent/itineraries`, but they are not an installed MCP connection. Personal homepage keys cannot authorize those legacy routes. Do not widen homepage permissions or enable the old shared-token routes as a shortcut.

Tools: `listItineraries`, `getItinerary`, `uploadItineraryPhoto`, `prepareItineraryPreview`, `getItineraryChange`, `showItineraryPreview`, component-only `markItineraryPreviewViewed`, and `publishItinerary`. `getEditorProfile` reports available access. Existing homepage tools remain. Itinerary addresses/templates are locked; existing text, Markdown, category, tags, cover/photos and publication state are editable. Drafts stay unpublished unless the exact approved proposal changes that state.

New private runtime mapping `ITINERARY_EDITORS_JSON` links OAuth member `coze-owner` to Nishat's existing CMS user. Every operation rechecks enabled membership and current CMS role. The old member list and hashed connection key were preserved. Teammates need independent keys and CMS mappings.

Previews render exact proposed content immediately in a responsive reading layout with site navigation omitted, not a pixel-identical full site preview. Photos stage privately and upload immutably after confirmation. Publication checks revision plus timestamp and atomically saves content, before/after audit and the existing deploy dirty marker. The existing once-per-minute CMS cron starts the site build. Failed builds and delays beyond ten minutes produce an attention state; only the exact public manifest match is called live.

Verification passed: 27 backend/MCP tests, real disposable PostgreSQL concurrency/rollback/role tests, full-scope OAuth and pg/Hyperdrive in Workerd, five-width local widget checks, and hosted listing of all 37 itineraries with a protected preview at 320/390/1440px. The hosted preview was ready in 2.9 seconds. Original homepage-only OAuth still works. Production content was unchanged. The standalone production dependency audit reported zero findings.

Public source `d5dc7cbd7cf6aa79d75098c000dbebf458102582` adds `/cms-itinerary-versions.json` generation. Cloudflare production build `cf591d61-ce50-45a3-a138-2a60c987ceac` passed in 129 seconds; all 37 hashes match current CMS content and the connector's canonical hashing. Earlier local Workerd failures and a non-main trigger missing-secret failure are documented, not claimed successful. No production content was published merely to test the connector.

One old broken blob photo in `paju-healing-trip-special-autumn-and-winter-course` is flagged and preserved until explicitly replaced/removed. All 37 itineraries validate and render. No historical content was silently repaired.

Pre-integration editor Worker: `340de33b-db3c-4138-a9ac-68a4a452b361`; pre-itinerary rollback: `517b79ba-7b55-494c-a485-6e0e3ce89034`. No schema rollback needed. Full operational handoff: [`chatgpt-editor/docs/ITINERARY_EDITOR.md`](../chatgpt-editor/docs/ITINERARY_EDITOR.md). Hosted test: `chatgpt-editor/scripts/verify-hosted-itineraries.mjs`.

## Automatic deployment

**Production verified 2026-09-29, 17:52 KST.** Both Workers built and deployed automatically from merged source commit `67d2ed9e9fb7ff354197c64e028bc66342da952c`:

| Worker | Successful build | Deployed version | Build running time |
| --- | --- | --- | --- |
| CMS | `a84e8831-b466-4d3f-9278-7bd467c02e19` | `a4cc4692-ddd7-40a6-b769-b4237a07a2a8` | 112 seconds |
| ChatGPT editor | `be02433a-48a7-4feb-b1b1-168d32c466a9` | `c97bf052-9ff3-4d47-9553-37988ec09677` | 33 seconds, after waiting for the CMS build |

These are observed times, not guarantees. Post-deploy CMS checks confirmed sign-in, static assets, the existing admin PMS connection, authenticated cron configuration and rejection of anonymous private APIs. The public site and admin panel returned HTTP 200. The real editor OAuth check read the current homepage and all 37 itineraries, advertised all 17 server tools, and rendered the private preview at 320/390/1440px. It verified ownership/capability checks and refusal to publish without confirmation; CMS content and timestamps remained unchanged. The private preview was ready in 2.65 seconds. The original Durable Object preview ID survived redeployment. Local stale Next route types were regenerated; the main working checkout also passes TypeScript and is clean.

The latest ChatGPT app metadata still lists seven old homepage tools. Server-side verification does not replace **Refresh tools**, new-scope consent or real ChatGPT client testing. Workspace sharing remains subject to the owner's permissions; no sharing permission was bypassed.

Both deployments watch only `main` of `cozmo-coze-ai/pagescms`:

| Worker | Root | Build | Deploy | Watched source |
| --- | --- | --- | --- | --- |
| `coze-cms` | `/` | Existing CMS tests, lint and `build:cloudflare` | `npm run deploy:cloudflare -- -c wrangler.production.jsonc` | Everything except `chatgpt-editor/**`, `docs/**`, `AGENTS.md` |
| `coze-homepage-editor` | `/chatgpt-editor` | `npm run check && npm test && npm run build` | `npx wrangler deploy` | `chatgpt-editor/**` and `lib/homepage-guard.ts`, excluding editor docs/README/AGENTS |

The root CMS excludes this independent project from Next TypeScript and ESLint. The connector owns its pinned dependencies and checks. Neither build runs production migrations. Editor build variables need no business credentials; its existing runtime secrets remain on the Worker. Changes to the public homepage still use the separate `coze_client/main` build, and itinerary saves still use the existing CMS publication queue.

Verified Cloudflare trigger configuration: editor `37bfdd51-f27b-45aa-9f10-144a0e5bbc0f` (Worker tag `549ccd435d22415ca12b11105249d77b`), CMS `6f7f29ae-8a3c-4c7b-9d1b-20f31b24e8c3`. The existing Git connection and build token are reused. The CMS build command, deploy command, branch filters and runtime bindings were preserved; only editor paths were excluded from its watch list. The editor's homepage preview asset hash is unchanged, preserving the existing homepage preview trigger.

Integration checks passed: 27 editor tests, editor types and Wrangler dry run, local OAuth/Workerd regression, both preview widgets at 320/390/768/1024/1440px, 17 CMS tests, CMS TypeScript/lint (nine existing warnings) and a clean OpenNext production build. The first local CMS build lacked the public `BASE_URL`; rerunning with the same three public build variables as Cloudflare passed. No runtime secrets were added to build variables. A staged-source scan found no protected credential values.

After deployment, verify CMS sign-in/admin connection, connector OAuth and tools, private mobile previews, and the public itinerary revision manifest. A healthy Worker is not proof that ChatGPT refreshed its cached tools or that workspace sharing is enabled.

## Source backups

- Reviewed CMS migration: `cozmo-coze-ai/pagescms` main, verified through `71ad0c5`; deployed application source is `e4c66053aa96851fe87d54dda33a60ecbc03897e`. Later commits document verification and cleanup.
- Earlier mixed CMS/editor working files: [backup/cms-editor-work-20260929](https://github.com/cozmo-coze-ai/pagescms/tree/backup/cms-editor-work-20260929), commit `e00371ac0ec0faf98aae9aa9081bbdc91c34a4f1`. This preserves the superseded CMS-hosted OAuth/MCP prototype. Do not bulk-merge it or run migration `0023_homepage_plugin_oauth.sql` merely because it is backed up.
- Historical standalone editor/plugin backup: [private coze_cms feature/itinerary-plugin](https://github.com/cozmo-coze-ai/coze_cms/tree/feature/itinerary-plugin). Current development belongs in this repository's `chatgpt-editor/` directory. Original homepage snapshot: [backup/homepage-editor-20260929](https://github.com/cozmo-coze-ai/coze_cms/tree/backup/homepage-editor-20260929), commit `ec8089a6ef226a73cd49da9b1cf97c9474f06544`. Backup branches do not replace the unrelated `coze_cms/main` or deploy automatically.

The original mixed `pagescms` files were preserved before the checkout was cleaned and synchronized. Credentials and generated bundles are excluded from Git backups. The combined-source integration retains the tested CMS and connector implementations; it does not activate the obsolete CMS-hosted OAuth prototype or require a database migration.
