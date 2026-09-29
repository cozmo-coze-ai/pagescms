# ChatGPT editor handoff — 2026-09-29

## Current connection

- Workflow plugin: [COZE Homepage & Itinerary Editor](https://chatgpt.com/plugins/plugin_ce7a0f7893008191a2b49a669dea575d), version **0.4.0**, saved and read back with all seven release files verified.
- Required connected app: `asdk_app_6abb1da4205c81919a0468aee3675954`.
- OAuth MCP endpoint: `https://coze-homepage-editor.cozmo-ca1.workers.dev/mcp`.
- The same-name workflow plugin and connected app are both needed.

The same connection now supports homepage design and existing CMS itinerary content with separate tools/scopes. Both require the requester's explicit yes after the exact preview; no separate admin reviewer. The existing homepage safeguards remain.

**ChatGPT activation pending:** refresh this developer app's tools and reconnect to approve `itineraries:read` / `itineraries:write`. The latest app metadata still listed only the old seven homepage tools. The owner reported not finding Refresh tools; guidance is pending. Do not create another same-name app or bypass consent. A complete itinerary preview/publication through the real ChatGPT client is not yet verified.

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

Deployed editor Worker: `340de33b-db3c-4138-a9ac-68a4a452b361`; previous rollback: `517b79ba-7b55-494c-a485-6e0e3ce89034`. No schema rollback needed. Full operational handoff: `C:\COZE_CORP\coze_homepage_editor\docs\ITINERARY_EDITOR.md`. Hosted test: `scripts/verify-hosted-itineraries.mjs`.

## Source backups

- Reviewed CMS migration: `cozmo-coze-ai/pagescms` main, verified through `71ad0c5`; deployed application source is `e4c66053aa96851fe87d54dda33a60ecbc03897e`. Later commits document verification and cleanup.
- Earlier mixed CMS/editor working files: [backup/cms-editor-work-20260929](https://github.com/cozmo-coze-ai/pagescms/tree/backup/cms-editor-work-20260929), commit `e00371ac0ec0faf98aae9aa9081bbdc91c34a4f1`. This preserves the superseded CMS-hosted OAuth/MCP prototype. Do not bulk-merge it or run migration `0023_homepage_plugin_oauth.sql` merely because it is backed up.
- Current standalone editor/plugin source: [private coze_cms feature/itinerary-plugin](https://github.com/cozmo-coze-ai/coze_cms/tree/feature/itinerary-plugin). Original homepage snapshot: [backup/homepage-editor-20260929](https://github.com/cozmo-coze-ai/coze_cms/tree/backup/homepage-editor-20260929), commit `ec8089a6ef226a73cd49da9b1cf97c9474f06544`. These branches do not replace the unrelated repository main or deploy automatically. The saved credential cannot access the dedicated `coze_homepage_editor` repository, so the existing private repository remains the verified backup location.

The original dirty `pagescms` checkout was preserved. Credentials and generated bundles are excluded from backups. The earlier source-backup task did not deploy. This subsequent extension deployed only the standalone connector and public verification support as detailed above, without changing CMS application code or running production migrations.
