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

Import, then review the results. Open the imported **COZE Website Editor**, make
it available to the intended team roles, and enable its COZE app for those
roles. The `policy` values in the repository catalog do **not** configure
ChatGPT workspace installation or authentication policies; the admin must set
those in the workspace. Each teammate authenticates their own COZE identity
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
  lifecycle. Refresh the connected app when its tool metadata changes, reconnect
  if new consent is required, and test in a new conversation. Marketplace sync
  does not refresh cached app tools or grant consent. Verify the tools from a
  representative team member's account before announcing availability to all.

Run `npm run check:plugin` from `chatgpt-editor/`. This is also part of the existing
Cloudflare editor build's `npm run check`. It validates catalog paths, matching
manifest identity/version, bundled assets and the registered app reference. The
Cloudflare check does not gate ChatGPT's separate sync: validate plugin changes
before merging. For runtime changes also run the normal editor checks and tests.

Personal ZIP copies in other workspaces remain separate. OpenAI requires a
`pluginId` migration target to belong to the same workspace. The existing COZE
plugin ID in this catalog is a private WORKSPACE plugin. Keep this marketplace
entry and plugin ID for future releases; do not create a second plugin. Matching
versions in GitHub and ChatGPT do **not** prove that GitHub management is active:
a package can also be released directly to the existing plugin.

To revert an instruction release, restore the prior content with a new version,
merge and sync. Do not delete/reimport the marketplace to force an update;
deleting it deletes its imported plugins.

## Activation evidence

Repository setup and validation are separate from workspace activation. On
2026-10-07, the private WORKSPACE plugin read back as version 0.5.2, release
`pluginrel_6ac6055c92288191b3ccbf3813ad2c75`, with app ID
`asdk_app_6abb1da4205c81919a0468aee3675954`. GitHub `main` commit
`988811973c20f81a99f2850749f49696e5e76605` carries the same 0.5.2 package;
the root catalog points to that same plugin ID. The repository's
`npm run check:plugin` validation passes. This coding session has no
authenticated workspace marketplace import/sync control; it cannot verify
whether the admin imported the catalog or whether daily sync is active.

To close activation, the admin should check **Admin > Plugins > Marketplaces**:
confirm a marketplace for `cozmo-coze-ai/pagescms` on `main`, the existing COZE
plugin ID in its import/sync report, and successful sync without errors. If it
is absent, perform the one-time import above. If already present, use **Sync
now** and inspect its saved report; do not delete/reimport it. Then confirm
role installation policy and app availability, and test homepage and itinerary
reads from a normal member account. Record the result here before claiming
central automatic updates are active.

Official source: [OpenAI: import and sync workspace plugins from GitHub](https://learn.chatgpt.com/docs/enterprise/plugin-management).
