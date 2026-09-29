# COZE ChatGPT editing — agreed priorities

Updated 2026-09-29 following the owner's correction. **Homepage editing comes first. CMS migration comes later and must not block homepage editing.**

The standalone implementation and current activation blockers are now tracked
in [`../coze_homepage_editor/README.md`](../coze_homepage_editor/README.md).
It is deployed at `https://coze-homepage-editor.cozmo-ca1.workers.dev/mcp`.
Hosted OAuth, homepage reads and isolated preview creation passed. The owner
reports completing ChatGPT connection setup. The new MCP app details page is
https://chatgpt.com/plugins/plugin_asdk_app_6abb1da4205c81919a0468aee3675954
Its URL reference is `plugin_asdk_app_6abb1da4205c81919a0468aee3675954`;
the installed app's `.app.json` uses `asdk_app_6abb1da4205c81919a0468aee3675954`.
This is the MCP app reference, not the existing skill package's identity.
Two entries currently have the same display name; do not remove either by name
alone. The existing skill plugin has now been updated directly to **0.3.1** and
attaches this app. Workspace publication, distinct teammate access and an actual
tool/preview test inside ChatGPT remain incomplete.

Cleanup inspection after the owner's request to remove an unused entry found
exactly two installed COZE entries: the 0.3.1 workflow plugin and its required
registered MCP app. Remote `plugin/read` confirms the app is a dependency of
the workflow plugin. The old skill entry was updated in place; it is no longer
an obsolete duplicate. Neither entry was uninstalled or deleted. Do not remove
the connector to reduce duplicate display names; that would break tool access.

## Verified remote update and remaining access restriction (2026-09-29)

**Latest sharing attempt: explicit permission denial.** The owner asked the
agent to share directly because the workspace directory/control is inaccessible.
Directory publishing and sharing by workspace link are separate permissions.
The supported API explicitly requires `discoverability:UNLISTED` for workspace
link access (workspace principals cannot be passed as explicit share targets).
The direct `plugin/share/updateTargets` request for this existing plugin,
`discoverability:UNLISTED`, `shareTargets:[]`, returned **HTTP 403 Forbidden**:
`Workspace plugin sharing permission required`.
The plugin remains PRIVATE, with Nishat as its sole owner, at 0.3.1. Do not
retry sharing or use another route until workspace sharing eligibility changes.
This is a confirmed sharing denial, distinct from the earlier generic ZIP error.

The agent can update the owned plugin but cannot grant ChatGPT workspace
permissions. If the workspace owner/admin cannot find the applicable sharing
control, send OpenAI Support this exact diagnostic (no credentials):

> In COZE HOSPITALITY 3.0, I cannot find the plugin sharing controls. My account
> is nishat@coze.care. Sharing COZE Homepage Editor
> (plugin_ce7a0f7893008191a2b49a669dea575d) with workspace members by link returns
> HTTP 403: "Workspace plugin sharing permission required". Please check this
> account's workspace role, Share plugins permission and feature availability.
> The plugin update succeeds, but both sharing and workspace directory access
> are blocked/unavailable to me.

The supported local Codex app-server management API resolved the existing
plugin as **`plugin_ce7a0f7893008191a2b49a669dea575d`**. It is owned by Nishat,
installed and enabled, with discoverability **PRIVATE**. Its original current
release was checked out before editing. `plugin/share/save` successfully updated
that same record to **0.3.1**; `plugin/read` using the backend ID verified the
new release, preserved identity/prompts/icon, updated instructions and attached
app `asdk_app_6abb1da4205c81919a0468aee3675954`. All seven downloaded files were
checked against the submitted source; only expected compatibility-manifest
normalization differed (empty keywords and skills-directory trailing slash).

Open the updated plugin:
https://chatgpt.com/plugins/plugin_ce7a0f7893008191a2b49a669dea575d

**Do not ask the owner to repeat ZIP uploads.** The user reported the same
generic upload error after the browser retry. Its exact cause remains unknown,
but direct updating succeeded. This is distinct from the verified sharing limit:
the remote list, save and read responses all return **`canPublishToWorkspace:
false`** for the authenticated account. A separate request for workspace link
sharing was explicitly denied as recorded above. No permission was bypassed.
A workspace admin must resolve sharing/publication eligibility before
listing it for COZE HOSPITALITY 3.0. Required-app workspace access also needs
verification: `app/read` reports **INDIVIDUAL** distribution, with all seven
homepage tools enabled for this account. Updating the plugin does not grant
teammates access to that app or provision individual COZE connection keys.

The verified downloaded release is currently at
`C:\Users\cozmo\.codex\plugins\cache\workspace-shared-with-me\gpt-96a7a163626e05f4185de181791ba82a\0.3.1`.
Do not edit the cache. Retrieve the latest remote release before future updates.
The authenticated account is `nishat@coze.care`; no credentials were printed or
added to this document. No homepage publication or service restart was performed.

## Historical 0.3.0 import attempt (superseded)

The owner confirms OAuth connection and provided app details with status
DEVELOPMENT. The installed app cache independently confirms its `.app.json`
mapping. The local package `plugins/gpt-96a7a163626e05f4185de181791ba82a`
is now **0.3.0**, with the registered app, current standalone tools and actual
preview-before-publishing instructions. Its name, three starter prompts and
supplied COZE icon are preserved. The old CMS `mcp.json` is removed; the web
package uses `.app.json` instead of a bundled MCP declaration.

Validated archive: `.codex/coze-homepage-editor-team-0.3.0.zip`.
The owner's first import failed in the **desktop app** with a generic error;
the later browser retry also failed. No server validation code was returned.
Local archive checks passed. The direct 0.3.1 update above supersedes this archive;
do not retry it or overwrite the newer remote release with this older candidate.
Build: `python scripts/package-homepage-plugin.py`.
Plugin and skill validators passed; ZIP contents match the six-file allowlist.
No credentials or shell hooks are included. Do not use the older archive
`.codex/coze-homepage-editor-plugin.zip` for this connection.

The owner reports **No plugins found** and no add button in the team listing.
That does not establish a permissions denial or confirm the old Apps > Drafts
view exists in their interface. The main Plugins plus menu was explicitly
observed to offer **Upload plugin archive**. Use that available import control
for the prepared package; prefer Upload new version if updating an existing
manually uploaded plugin. A package name does not identify a remote record.

Current documentation separates plugin upload, workspace sharing, and access
to the required app. Admin > Plugins manages availability; a plugin's Share
plugin menu may offer the named workspace directory audience, depending on
role permissions. Never promise a missing menu, invent an admin URL, or claim
uploading a plugin makes a personal development app accessible to teammates.
Only the owner's COZE account is provisioned; teammates need distinct access.

At the time of this earlier package attempt, no remote update had been made.
Hosted Plugin Creator mutation tools were unavailable; the supported local
app-server management interface subsequently allowed the verified update above.

Sources: [plugin administration and sharing](https://help.openai.com/en/articles/20001256-plugins-in-chatgpt-and-codex),
[registered app packaging](https://developers.openai.com/plugins/build/plugins).

For authorized Cloudflare access and the current build-variable repair, see
[the agent access handoff](docs/CLOUDFLARE_AGENT_ACCESS.md). It documents the
encrypted local credential location; no token is stored in these documents.

## 1. Homepage editing from ChatGPT — current priority

The designer describes a homepage change in ChatGPT. The editor reads the current source, checks the exact proposed change, and shows an actual rendered preview before asking "Publish this to www.coze.care?" The requesting designer's yes is sufficient; there is no separate reviewer or admin approval step. The editor commits that exact previewed change to GitHub and verifies its automatic Cloudflare deployment. A written change summary is not a visual preview. The preview must be accessible to the designer from ChatGPT; an agent-only localhost URL is insufficient.

Target flow:

```text
Designer in ChatGPT
  → authenticated homepage MCP connection hosted on Cloudflare
  → checked homepage-only change in cozmo-coze-ai/coze_client
  → rendered mobile/desktop preview accessible from ChatGPT
  → requesting designer says yes to publishing in chat
  → GitHub commit on main
  → Cloudflare Git build and deployment
  → verification of the live homepage commit
```

GitHub remains the authoritative source for code. Cloudflare serves the public homepage. The connection must run independently of `pagescms`, CMS login, Vercel and the CMS migration. Configure repository credentials in the Cloudflare connection's secret storage when that connection is ready; the earlier instruction to add a token to the Vercel CMS is superseded for this work.

Preserve homepage-only file access, the locked shared copy, four-language checks, mobile-first design, exact checked-proposal approval, stale-commit protection and separately confirmed undo. A commit or successful build alone must not be reported as live.

Activation status:

1. Done: standalone Cloudflare Worker, byte-identical homepage guard, homepage-only writes, persisted drafts and preview-gated publishing.
2. Done for the owner: OAuth sign-in and read/write scopes. Provision distinct team keys before sharing; publishing credentials stay server-side.
3. Done: main-to-production automatic builds and exact live marker previously verified. The separate preview branch now automatically builds against a separate Worker.
4. Done: hosted preview build and browser checks at 320/390/1440px, with all four locale commit markers verified. Local checks cover confirmation, stale commits, failed builds, member isolation and mobile UI. Real ChatGPT rendering and an explicitly approved publication/reversal remain untested.
5. Done: the existing hosted plugin is updated to 0.3.1 and its required app/instructions were read back. Workspace listing is blocked by `canPublishToWorkspace:false`; team app access and individual connections remain pending.

**Status:** deployed connector; hosted sign-in and preview creation verified; ChatGPT connection reported by owner. Workspace sharing and actual ChatGPT tool/preview execution remain unverified. Follow the current standalone README rather than installing the old CMS ZIP.

## 2. Move CMS to Cloudflare and keep Supabase — later

Move the `pagescms` application serving `cms.coze.care` from Vercel to Cloudflare after the homepage workflow is working.

The intended data path is **CMS on Cloudflare → authenticated CRUD in the existing Supabase database/storage**. Keep existing records, roles and permissions. `pagescms/db/index.ts` already uses Drizzle/Postgres with Supabase pooler support; the hosting migration should retain the existing data source rather than create a replacement database.

Assess the Next.js runtime/adapter and database connection compatibility, verify login and create/read/update/delete flows in preview, then cut over the CMS hostname. Retire its Vercel deployment only after the Cloudflare deployment and rollback path are verified. Privileged database credentials remain server-side.

This phase is deferred. Do not run its migrations, change CMS hosting, or require its completion to connect the homepage editor.

## 3. Ongoing automatic publishing

For the homepage, this is part of phase 1: the designer requests a change, approves the checked result in ChatGPT, and the deployment proceeds automatically. Manual code copying and developer relay should not be needed for each approved change. CMS content editing is a separate data workflow in phase 2.

## Earlier prototype

The prior CMS/OAuth implementation, package and validation remain available as reusable work. The ZIP at `.codex/coze-homepage-editor-plugin.zip` currently targets the old CMS endpoint and is **not the activation package for this corrected plan**. Do not install it as the independent Cloudflare connection.

Historical implementation details are preserved in [the CMS prototype archive](docs/archive/homepage-cms-connector-prototype-2026-09-28.md). Current test evidence is in [HOMEPAGE_EDITOR_TEST_STATUS.md](HOMEPAGE_EDITOR_TEST_STATUS.md).

Official references: [OpenAI MCP authentication](https://developers.openai.com/plugins/build/auth), [Cloudflare MCP authorization](https://developers.cloudflare.com/agents/model-context-protocol/protocol/authorization/), [Cloudflare automatic builds](https://developers.cloudflare.com/workers/ci-cd/builds/), [Next.js on Cloudflare](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/).
