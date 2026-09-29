# Homepage Editor test status

**Latest direct sharing test:** `plugin/share/updateTargets` for the existing
plugin with `discoverability:UNLISTED` and `shareTargets:[]` returned HTTP 403:
`Workspace plugin sharing permission required`. This tests workspace link access
separately from directory publication. Initial explicit workspace-principal
input was rejected by local parameter validation, which instructed use of
UNLISTED; the correctly formed remote request then received the access denial.
Read-back confirms version 0.3.1 remains PRIVATE with Nishat as the sole owner.
Do not retry writes until the workspace permission/eligibility changes. The
handoff contains a credential-free support message for the missing controls.

**Owner-reported ChatGPT test:** the plugin read homepage commit `01fdc3f`,
identified the allowed component and four locale files, and reported starting
a compact-mobile-hero preview build. This demonstrates progress through the
in-chat workflow, but no rendered preview, publication or completed build was
provided. Do not describe that preview as ready or publish it from this session.
The latest authenticated sharing recheck still reports PRIVATE,
`canPublishToWorkspace:false`, and INDIVIDUAL app distribution. No company
sharing or workspace permission change was performed.

**Latest outcome: existing remote plugin updated successfully to 0.3.1.**
The supported Codex app-server API resolved the actual record
`plugin_ce7a0f7893008191a2b49a669dea575d`, checked out its current source, and
saved the update directly. Remote read-back verifies the current standalone
instructions and required app `asdk_app_6abb1da4205c81919a0468aee3675954`.
Identity, three starter prompts, icon and supporting skill files were retained.
All seven materialized files match the submitted source, accounting for the
generated compatibility manifest's empty keywords and normalized skills path.
Plugin and skill validators passed. The archive-upload failure was avoided;
no further ZIP upload is needed for this update.

**Verified remaining restriction:** list/save/read all report
`canPublishToWorkspace:false`. The plugin remains PRIVATE with Nishat as owner;
team publication was not attempted against that restriction. The app metadata
reports INDIVIDUAL distribution and seven enabled tools for this account.
Workspace-admin eligibility, required-app availability to teammates, individual
COZE connections and real ChatGPT preview/publish testing remain outstanding.
This is not evidence that the same restriction caused the generic upload error.

The user reported the same `Couldn't add plugin. Try again.` after the browser
retry as in the desktop app. Its server error code is still unknown. The public
dependency lookup cannot inventory private plugins; the authenticated management
API, rather than absence from public search, established the state above.

**Earlier 2026-09-29 team package (superseded):** prepared and validated
`.codex/coze-homepage-editor-team-0.3.0.zip`, attaching registered app
`asdk_app_6abb1da4205c81919a0468aee3675954` using the same mapping as its
installed generated manifest. Instructions now use the standalone preview
tools rather than the old CMS tools. Plugin/skill validation and ZIP content
checks passed. No remote update had been performed at that point; the direct
0.3.1 update above supersedes this 0.3.0 candidate. Workspace publication remains pending.
See HOMEPAGE_PLUGIN_SETUP.md for the user's observed UI and current handoff;
the empty team directory does not prove a workspace permission restriction.

**2026-09-29 browser sign-in fix:** the user reached the ChatGPT OAuth consent
page but received `Invalid sign-in origin`. A real Edge browser reproduced
`Origin: null` / HTTP 403 caused by the page's `no-referrer` policy. The deployed
connector now uses `strict-origin`; the same browser test passes HTTP 302,
code exchange and authenticated homepage reads. Cross-origin, missing-origin
and null-origin submissions remain rejected. Local runtime regression tests
use an actual native form submission instead of manually supplying Origin.
Connector version: `517b79ba-7b55-494c-a485-6e0e3ce89034`.
The user must restart Connect from ChatGPT so the form uses the new policy.

**Scope corrected 2026-09-29:** the active target is an independent homepage
connection on Cloudflare, followed later by the CMS hosting migration and
Supabase CRUD work. See [the agreed priorities](HOMEPAGE_PLUGIN_SETUP.md).
The standalone connection in
[`coze_homepage_editor`](../coze_homepage_editor/README.md) is deployed at
`https://coze-homepage-editor.cozmo-ca1.workers.dev/mcp`. OAuth sign-in,
authenticated homepage/file reads, validation and isolated preview creation
passed. KV permission and the connector secrets are installed. The first
preview build passed in 240.5 seconds; browser checks passed at 320/390/1440px,
including visible images, no overflow, all four locale commit markers and
blocked booking/API routes. Main and the live homepage were not changed.
The owner reports ChatGPT connection is complete; actual in-chat tool/preview
execution and team access remain unverified.
Fifteen guard/backend/MCP tests, TypeScript, Workers-runtime OAuth and outbound
GitHub reads pass. The simulated mobile/desktop preview checks pass separately.
All results
in the historical table below describe the earlier CMS-hosted prototype; they
do not prove that the ChatGPT connection is ready. Git-to-Cloudflare automatic
deployment has separately been verified as described below. The previous Vercel
token setup instruction is superseded for the homepage-first work.

## Historical CMS prototype checks

Current Cloudflare access and build repair are tracked in
[CLOUDFLARE_AGENT_ACCESS.md](docs/CLOUDFLARE_AGENT_ACCESS.md). On 2026-09-29 the
owner-supplied token was verified active and stored encrypted outside Git.
The homepage's Supabase source credentials passed a read-only query. Adding
the missing build variables succeeded after the owner corrected the token's
future start date. The `coze-client` production trigger was verified against
`cozmo-coze-ai/coze_client`, branch `main`; `SUPABASE_URL` and the secret
`SUPABASE_SERVICE_ROLE_KEY` were uploaded and read back successfully. The owner's retry subsequently stalled
in content fetching and was cancelled during the authorized speed repair.
Production caching is now enabled. The local speed fix on
`coze_client` branch `fix/cloudflare-content-build-speed` passes ten focused
tests and a full local build: cold content fetching 102.0s, warm fetching 3.7s,
warm full build 22.6s. With the owner's approval, commit `01fdc3f` was pushed
to production main; Cloudflare completed the first cold build/deployment in
281.1s (content fetching 164.1s). Both public hostnames returned HTTP 200 and
the exact new commit marker. The repeated hosted build/deployment passed in
133.4s end to end: content sync 13.2s, 538 media files restored from cache,
16 reused unchanged, zero media downloads. Both homepage hostnames and `/stay`
returned HTTP 200 with the approved commit marker after that deployment.
See [the build investigation](../coze_client/docs/build-speed-2026-09-29.md).
This verifies Git-to-Cloudflare publishing, not activation of the new ChatGPT connection.

The following table remains the September 28 CMS prototype evidence.

Checked 2026-09-28 (KST). The CMS-hosted MCP prototype and plugin update were prepared locally and were not deployed. These are historical checks, not a fresh live-system check on September 29.

| Check | Result |
| --- | --- |
| Existing homepage guards | 10/10 passed |
| New MCP/OAuth integration checks | 10/10 passed; real SDK HTTP client, public/confidential OAuth clients, CMS login SSO, PKCE, consent, replay, refresh rotation, PostgreSQL migration and RLS |
| TypeScript | Passed |
| Lint | Passed; seven pre-existing warnings |
| Production compilation | `npx next build` passed with synthetic database settings and MCP disabled; no migration postbuild |
| Live GPT Actions schema | HTTP 200 |
| Live homepage API without key | HTTP 401 |
| Live CMS key-management route | HTTP 401; configured and protected |
| Live admin key-management route | HTTP 403; deployed and protected |
| Live authenticated homepage read | HTTP 503: `Homepage GitHub integration is not configured.` |
| Live MCP endpoint / discovery | HTTP 404; new implementation not deployed |
| Live Cloudflare publish / ChatGPT browser sign-in | Not tested; pending GitHub access and verified Git deployment |
| Hosted plugin update / team sharing | Not saved; Plugin Creator create/update tools unavailable in this session |

The old report's missing admin-key routes were stale; current read-only checks above replace them. No homepage publishing, production migrations, secret changes or service restarts were performed for the new MCP implementation.

Update package: `plugins/gpt-96a7a163626e05f4185de181791ba82a/`, archived at `.codex/coze-homepage-editor-plugin.zip`. It preserves the existing package identity, conversation starters and homepage restrictions, and adds the implemented OAuth MCP connection. A packaged endpoint URL is not proof of activation.

Read-only public prerequisite check: `node scripts/check-homepage-editor-setup.mjs`. This does not verify GitHub credentials, OAuth sign-in or deployment. Connection tests: `npm run test:homepage-mcp`; synthetic data and isolated PostgreSQL only.

Before inviting the team, test the full flow against a preview: CMS login and consent → getHomepage → check a small mobile change → explicit approval → verified live build → separately approved undo. Confirm viewers cannot publish and logout/removed consent stops access. Check 320px and 390px first, then desktop. Test photo attachments in the real ChatGPT host.
