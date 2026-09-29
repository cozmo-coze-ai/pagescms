# ChatGPT editor handoff — 2026-09-29

## Current connection

- Workflow plugin: [COZE Homepage Editor](https://chatgpt.com/plugins/plugin_ce7a0f7893008191a2b49a669dea575d), version 0.3.1.
- Required connected app: `asdk_app_6abb1da4205c81919a0468aee3675954`.
- OAuth MCP endpoint: `https://coze-homepage-editor.cozmo-ca1.workers.dev/mcp`.
- The same-name workflow plugin and connected app are both needed.

The connection edits homepage design only. Its tools read homepage files, prepare an isolated rendered preview, show that preview, and publish the exact preview after the requester's confirmation. It has no itinerary tools. The owner reported a connected ChatGPT account and a homepage preview build starting; completion of a real ChatGPT preview/publication has not been verified.

Workspace sharing previously returned `Workspace plugin sharing permission required`. Do not claim company-wide availability or retry sharing until the permission has changed. Each teammate needs a separate connection; do not share the owner's credentials.

## Itineraries

The CMS is now on Cloudflare, using the existing Supabase data. The owner confirmed itinerary text and photos load. This hosting migration does not add itinerary tools to ChatGPT.

Legacy itinerary REST routes exist under `app/api/agent/itineraries`, but they are not an installed MCP connection. Personal homepage keys cannot authorize those legacy routes. Do not widen homepage permissions or enable the old shared-token routes as a shortcut.

An itinerary editor still needs scoped user authorization, current itinerary reads, validation and conflict protection, a preview of the exact proposed content, requester confirmation before publication, and verified publication status. Whether to expose it as a separate plugin or add a distinct connection to the existing workflow is awaiting the owner's preference. No production itinerary data was changed for this handoff.

## Source backups

- Reviewed CMS migration: `cozmo-coze-ai/pagescms` main, verified through `71ad0c5`; deployed application source is `e4c66053aa96851fe87d54dda33a60ecbc03897e`. Later commits document verification and cleanup.
- Earlier mixed CMS/editor working files: [backup/cms-editor-work-20260929](https://github.com/cozmo-coze-ai/pagescms/tree/backup/cms-editor-work-20260929), commit `e00371ac0ec0faf98aae9aa9081bbdc91c34a4f1`. This preserves the superseded CMS-hosted OAuth/MCP prototype. Do not bulk-merge it or run migration `0023_homepage_plugin_oauth.sql` merely because it is backed up.
- Standalone deployed editor source: [private coze_cms backup/homepage-editor-20260929](https://github.com/cozmo-coze-ai/coze_cms/tree/backup/homepage-editor-20260929), commit `ec8089a6ef226a73cd49da9b1cf97c9474f06544`. This separate branch does not change that repository's main or configure automatic deployment. A dedicated `coze_homepage_editor` repository was created, but the saved credential could not access it; the private backup branch is the verified source location.

The original dirty `pagescms` checkout was preserved. Credentials and generated bundles were excluded from both backups. CMS homepage and MCP tests, TypeScript, and lint passed (nine lint warnings, no errors); standalone editor checks and all 15 backend/MCP tests passed. No production build, migration, content edit, or deployment was performed for the source backup.
