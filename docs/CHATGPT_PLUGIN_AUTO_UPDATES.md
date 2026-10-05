# Central ChatGPT plugin updates

The maintained plugin is in `chatgpt-editor/plugin/coze-editor`. The company catalog
is `.agents/plugins/marketplace.json` on `cozmo-coze-ai/pagescms`, branch `main`.
This catalog references the existing bundle and connected app; it does not copy
credentials, grant CMS access or publish website content.

## One-time company setup

**Administrator only:** the person completing the import authorizes their GitHub
connection once. The founder and team members who use the plugin do not need
GitHub accounts or repository access. Give them the verified shared plugin link
and [the short user guide](FOUNDER_EDITOR_QUICK_START.md), not this setup guide.

In **COZE HOSPITALITY 3.0**, open **Admin > Plugins > Add > Import marketplace**.
The owner confirmed this option is available on 2026-09-29. Enter:

| Field | Value |
| --- | --- |
| Source | `https://github.com/cozmo-coze-ai/pagescms` |
| Path | Leave empty |
| Branch, tag, or commit | `main` |

Authorize the admin's GitHub connection to read this private repository. Use the
ChatGPT sign-in flow; do not paste GitHub tokens into chat or plugin files.
The marketplace entry includes the verified existing workspace plugin ID
`plugin_ce7a0f7893008191a2b49a669dea575d`. Confirm that this ID appears
after import; it keeps the existing plugin identity rather than creating a
second COZE plugin. The admin must import from the same Business workspace
that owns this plugin.

Import, then review the results. Open the imported **COZE Homepage & Itinerary
Editor**, make it available to the intended team roles, and enable its required
COZE app for those roles. Each teammate authenticates their own COZE identity
with the corresponding CMS access. Plugin installation does not provision it.

The current app reference is `asdk_app_6abb1da4205c81919a0468aee3675954`, endpoint
`https://coze-homepage-editor.cozmo-ca1.workers.dev/mcp`. If import reports an
unavailable app, stop and inspect its company availability before changing this
reference. Do not remove the app dependency, share the owner's key, or report a
successful integration just because the plugin instructions imported.

Keep automatic daily sync enabled. Start a new company chat and test:

> Show my homepage connection and list the available itineraries. Do not change or publish anything.

Both reads must succeed. If itinerary tools are missing, refresh the app's tools;
if scope consent is missing, reconnect. Server health alone is not verification
of the tools visible to this workspace.

## How updates work

- **Server code:** merge tested changes to `main`; the existing Cloudflare Git
  build deploys the shared editor Worker. Existing member keys and endpoint stay
  intact. Server implementation changes do not require distributing ZIP files.
- **Plugin instructions/assets:** edit the single bundle, increment `version` in
  both manifests, validate, then merge to `main`. ChatGPT's GitHub marketplace
  sync imports updates daily. Admin > Plugins > Marketplaces > COZE HOSPITALITY
  3.0 > **Sync now** requests an earlier sync. Check the sync report before
  announcing an update. Test in a new conversation.
- **New tools or scopes:** tool discovery and user consent have a separate
  lifecycle. The current development app may need Refresh tools and reconnection;
  marketplace sync does not promise to refresh an app's cached tools or consent.

Run `npm run check:plugin` from `chatgpt-editor/`. This is also part of the existing
Cloudflare editor build's `npm run check`. It validates catalog paths, matching
manifest identity/version, bundled assets and the registered app reference. The
Cloudflare check does not gate ChatGPT's separate sync: validate plugin changes
before merging. For runtime changes also run the normal editor checks and tests.

Personal ZIP copies in other workspaces remain separate. OpenAI requires a
`pluginId` migration target to belong to the same workspace. The existing COZE
plugin ID in this catalog was verified as a private WORKSPACE plugin, version
0.4.1, before adding it. Keep this marketplace entry and plugin ID for future
releases; the GitHub source is already at version 0.4.2.

To revert an instruction release, restore the prior content with a new version,
merge and sync. Do not delete/reimport the marketplace to force an update;
deleting it deletes its imported plugins.

## Activation evidence

Repository setup and validation are separate from workspace activation. The
current plugin record is a private WORKSPACE plugin. No authenticated workspace
marketplace import tool is available to this coding session. The owner must complete the import
above. Record its result, company plugin ID, sync status and successful homepage
and itinerary reads here before claiming company auto-updates are active.

Preparation checks passed: native catalog discovery finds the existing plugin
and its instruction skill; package validation, editor TypeScript, all 27 tests and
Wrangler dry-run build passed. Native local discovery did not resolve connected
apps, so the source `.app.json` check is not proof of company app availability.
Verify the required app in the actual workspace import results.

Release `1577758fa469d099514692ae0d360c3e2ef1568c` was pushed to `main`.
Cloudflare CMS build `32453656-a722-4f7d-9c87-862d67df098f` succeeded in 103 seconds;
editor build `9ed50447-9ace-47df-b62d-9c4be7259d3b` succeeded in 36 seconds after
the CMS build. Post-deploy checks returned HTTP 200 for CMS, the public homepage
and editor health, with both configured flags true. Plugin instructions, app ID
and runtime source were unchanged. Workspace import and daily sync remain
unverified until the owner completes the company import and reads both systems.

Official source: [OpenAI: import and sync workspace plugins from GitHub](https://learn.chatgpt.com/docs/enterprise/plugin-management).
