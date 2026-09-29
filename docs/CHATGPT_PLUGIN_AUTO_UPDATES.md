# Central ChatGPT plugin updates

The maintained plugin is in `chatgpt-editor/plugin/coze-editor`. The company catalog
is `.agents/plugins/marketplace.json` on `cozmo-coze-ai/pagescms`, branch `main`.
This catalog references the existing bundle and connected app; it does not copy
credentials, grant CMS access or publish website content.

## One-time company setup

In **COZE HOSPITALITY 3.0**, open **Admin > Plugins > Add > Import marketplace**.
The owner confirmed this option is available on 2026-09-29. Enter:

| Field | Value |
| --- | --- |
| Source | `https://github.com/cozmo-coze-ai/pagescms` |
| Path | Leave empty |
| Branch, tag, or commit | `main` |

Authorize the admin's GitHub connection to read this private repository. Use the
ChatGPT sign-in flow; do not paste GitHub tokens into chat or plugin files.
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

Personal ZIP copies remain separate. The existing personal plugin ID must not be
used as a company migration target: OpenAI requires the target plugin to belong
to the same workspace. Once a company plugin exists, retain the same marketplace
entry. If migrating an already existing company plugin, first verify its ID in
that workspace and use the documented `pluginId` migration mechanism.

To revert an instruction release, restore the prior content with a new version,
merge and sync. Do not delete/reimport the marketplace to force an update;
deleting it deletes its imported plugins.

## Activation evidence

Repository setup and validation are separate from workspace activation. At the
time this setup was prepared, the personal plugin was private and reported
`canPublishToWorkspace: false`. No authenticated workspace marketplace import
tool is available to this coding session. The owner must complete the import
above. Record its result, company plugin ID, sync status and successful homepage
and itinerary reads here before claiming company auto-updates are active.

Preparation checks passed: native catalog discovery finds the existing plugin
and its instruction skill; package validation, editor TypeScript, all 27 tests and
Wrangler dry-run build passed. Native local discovery did not resolve connected
apps, so the source `.app.json` check is not proof of company app availability.
Verify the required app in the actual workspace import results.

Official source: [OpenAI: import and sync workspace plugins from GitHub](https://learn.chatgpt.com/docs/enterprise/plugin-management).
