# COZE Homepage & Itinerary Editor

One Cloudflare MCP/OAuth connection for homepage design and CMS itinerary creation/editing. The requester sees the exact preview and confirms publication. No separate admin reviewer.

**Current source release: plugin 0.4.2.** It adds preview-first creation at a unique itinerary address while preserving the same approval, audit and deployment checks used for edits. ChatGPT still needs the existing app's **Refresh tools** and consent to the itinerary scopes; its latest metadata read showed the old homepage tools. Full details, limitations, tests and rollback: [Itinerary extension](docs/ITINERARY_EDITOR.md).

Canonical source and complete plugin bundle: [`cozmo-coze-ai/pagescms/main/chatgpt-editor`](https://github.com/cozmo-coze-ai/pagescms/tree/main/chatgpt-editor). This directory is an independent npm project deployed to the existing `coze-homepage-editor` Worker. The CMS at the repository root deploys separately to `coze-cms`. Both use Cloudflare Git builds; runtime secrets and the existing OAuth endpoint stay unchanged. The original `coze_cms/feature/itinerary-plugin` branch is a historical backup. See [deployment and activation](../docs/CHATGPT_EDITOR_HANDOFF.md).

From this directory run `npm ci --ignore-scripts`, `npm run check`, `npm test`, and `npm run build`. The build is a Wrangler dry run; `npm run deploy` changes the live Worker. Do not run the root CMS TypeScript/lint commands against this project: its dependency versions and runtime differ.

The original homepage setup history below is retained for operational context; this canonical source location and the current release status above supersede earlier source-backup instructions.

## Original homepage activation history

Status on 2026-09-29: **deployed; hosted OAuth, homepage reads, automatic isolated preview build and browser checks passed. The owner connected ChatGPT and reported that a homepage preview build started. Completion of a real ChatGPT preview/publication is not yet verified.**
The public homepage's existing Git-to-Cloudflare deployment works independently.

Source backup: [cozmo-coze-ai/coze_cms, branch backup/homepage-editor-20260929](https://github.com/cozmo-coze-ai/coze_cms/tree/backup/homepage-editor-20260929) (private). This separate branch contains this connector's source and does not alter that repository's main branch or configure automatic Worker deployments. A dedicated `coze_homepage_editor` repository was created, but the saved fine-grained GitHub credential could not access it; the existing private repository is the verified backup location.

Existing workflow plugin: [COZE Homepage & Itinerary Editor](https://chatgpt.com/plugins/plugin_ce7a0f7893008191a2b49a669dea575d), upgraded from 0.3.1 to 0.4.0. It requires the same connected MCP app `asdk_app_6abb1da4205c81919a0468aee3675954`. Workspace sharing previously returned `Workspace plugin sharing permission required` and has not been verified as resolved. The itinerary extension preserves that audience and connection.

MCP endpoint: `https://coze-homepage-editor.cozmo-ca1.workers.dev/mcp`.
Use OAuth. Do not put GitHub, Cloudflare or old CMS API keys into ChatGPT.
Only the owner has been provisioned; teammates need separate member keys.

**Browser sign-in repair, 2026-09-29:** reproduced the reported 403 in a real
Edge form submission: our `Referrer-Policy: no-referrer` produced `Origin: null`,
which the strict same-origin check rejected. Changed the consent page policy to
`strict-origin`, preserving origin checks, PKCE and browser-bound consent cookies.
The runtime regression test now submits the actual form in a browser and also
rejects missing, null, foreign and sibling origins. Hosted browser sign-in,
OAuth code exchange and authenticated `getHomepage` subsequently passed.
Deployed connector version: `517b79ba-7b55-494c-a485-6e0e3ce89034`.
Use `node scripts/verify-hosted.mjs browser` with the protected key supplied
through the process environment. Old open forms retain the old policy: restart
Connect from ChatGPT to obtain a fresh form. The owner subsequently reported a
connected account and a homepage preview build starting in ChatGPT.

## Team experience

Describe a homepage change in ChatGPT → build an isolated actual preview → inspect phone/desktop and language views → answer “yes” to “Publish this to www.coze.care?” → automatically build and verify the live homepage. The requester is the approver. No separate admin review.

`prepareHomepagePreview` validates an exact base commit and creates a preview branch; it does not update main. `publishHomepage` advances main only to that same preview commit, after a verified preview-load acknowledgement and `confirmedByUser: true`. The server cannot read the user's conversation: the connected ChatGPT skill must obtain explicit confirmation; the boolean is not independent proof of user consent. Changes after the preview invalidate publication. Unknown, failed and merely deployed states never imply live.

The renderer uses the MCP Apps bridge, a bundled component and an isolated static Worker. Only its four homepages and static assets are served. Booking/API requests, forms and background API calls are blocked; no production Worker bindings are copied. A verified origin + exact commit message acknowledges that the page loaded; an iframe `load` event alone is insufficient. This does not assert that a human inspected every pixel.

## Local checks

```powershell
npm ci --ignore-scripts
npm run check
npm test
npm run test:runtime
npm run test:widget
```

The runtime test uses synthetic keys and local KV/Durable Objects; no production records change. The browser test uses installed headless Edge and a simulated MCP Apps host at 320, 390, 768, 1024 and 1440px. Its screenshots use a synthetic homepage. It is not proof of installation or iframe approval in ChatGPT. `npm run build` only bundles with Wrangler `--dry-run`; `npm run deploy` really publishes and is a separate activation action.

## Activation handoff

**GitHub credential update, 2026-09-29:** the owner supplied a token. It was
stored encrypted outside Git, and authenticated reads of `cozmo-coze-ai/coze_client`
and `main` succeeded. See [the protected access handoff](../docs/CLOUDFLARE_AGENT_ACCESS.md).
GitHub writes were verified with an isolated CSS-comment-only preview commit.
Connector secrets, OAuth KV and the dedicated preview build trigger are installed.
The first hosted read exposed Cloudflare's rejection of `redirect: "error"`;
requests now use manual redirects and reject non-success responses. The runtime
test exercises outbound GitHub reads to prevent this regression.

1. Obtain a fine-grained GitHub token for **resource owner `cozmo-coze-ai`**, **only repository `coze_client`**, **Contents: Read and write** (Metadata read is automatic). Store using `scripts/save-github-token.ps1`, outside Git with Windows DPAPI. Never paste keys into chat. Existing local Git SSH access is not a Worker HTTPS credential. A GitHub App is a future alternative for automatic credential rotation.
2. **Done:** Workers Scripts/Edit, Workers Builds Configuration/Edit and Workers KV Storage/Edit are verified for the COZE account. Protected credentials and exact resource IDs are in `../docs/CLOUDFLARE_AGENT_ACCESS.md`.
3. **Done for the owner:** connector OAuth KV, Durable Object, actual origin, preview Worker tag and secrets `GITHUB_TOKEN`, `CF_API_TOKEN`, `TEAM_MEMBERS_JSON`. Team records are `{id,name,keyHash,enabled}`; keys must be independent random 32-byte values, stored only as SHA-256 hashes in the Worker. Disabling a member blocks existing sessions on every request. Do not reuse a token shared in old chats. `scripts/copy-owner-connection-key.ps1` copies the protected owner key to the clipboard for the OAuth form without printing it; never share this key with teammates.
4. **Done:** a separate `coze-homepage-preview` Worker has version URLs and no production bindings. Its cached build trigger watches the exact branch `coze-homepage-preview`; prefix patterns were rejected by the Builds API. It builds the repository, downloads the immutable packager from this connector, checks its SHA-256, and uploads using `npx wrangler versions upload --config dist/homepage-preview.wrangler.json`. The exact build command is generated in `generated/preview-trigger.json`. Source lives under this project's `infrastructure/`; no main-branch infrastructure commit is needed. The production non-main trigger excludes this preview branch, and the main trigger remains unchanged. Content-fetch credentials are **build-time only**. Only the preview branch may be force-updated; publication to main is always a checked fast-forward.
5. **Hosted checks passed:** OAuth discovery, sign-in, `getHomepage`, file reads, validation, preview commit creation, automatic build and exact-version verification. Draft `3344d543-666e-4d44-b89f-91c15d6769aa` / commit `0d068def60e653738479bc5079ee5d185eae0019` contains only a CSS comment. Build `82b8bf76-27ae-48e7-a359-d2930b95d3fa` succeeded in **240.5 seconds** (first cold build, including asset upload and cache save; not a latency guarantee). Preview: `https://073d66ef-coze-homepage-preview.cozmo-ca1.workers.dev`. Headless Edge verified 320/390/1440px, no horizontal overflow or uncaught errors, visible images loaded, all four locale commit markers, and blocked non-homepage routes/mutations. The 390px screenshot was visually inspected. Main and the live site remain `01fdc3f4b4ed7697c9de14838fa2da6a39ae5e1b`; the production Worker had no additional build. Run `scripts/verify-hosted.mjs` with the protected owner key in process environment; `prepare` creates only an isolated comment preview, `status <id>` reads status, and `scripts/check-hosted-preview.mjs` checks the returned ready preview in a browser.
6. **Owner connection and plugin update completed:** `/mcp` is attached through OAuth to the plugin linked above, whose skill uses these actual tool names. **Do not reuse the old CMS plugin ZIP**. Finish verifying a rendered preview in the real ChatGPT client and obtain workspace sharing permission before distributing in COZE HOSPITALITY 3.0. Nested frame support/domain policy is an activation check: current development CSP is limited to the COZE Workers subdomain and backend URLs to the preview Worker. Do not assume a shared hosting suffix proves common ownership. Prefer verified COZE-owned domains for wider distribution; additional domain setup/iframe justification may be necessary. If embedding is blocked, publication stays blocked; never mark a preview viewed just to bypass the check.
7. With the requester watching, perform one exact approved change, verify `live`, and test a fresh reversal through the same preview/confirmation flow. There is no dedicated undo tool yet. PostgreSQL/Supabase schema changes and existing operational systems are outside this connector. The new itinerary flow uses the same connection and existing CMS database with separate scopes; see the current extension handoff.

## Implementation boundaries and remaining verification

- The vendored homepage guard is copied byte-for-byte from the existing CMS guard. File allowlist, shared-copy lock, executable Astro lock and four-language checks are retained.
- OAuth uses Cloudflare's maintained provider: PKCE S256, browser-bound consent cookies, expiring hashed tokens and code replay protection. No custom token protocol.
- Git writes and publishing intents are serialized through one Durable Object. Retry is idempotent, including an ambiguous GitHub write response.
- Tests cover confirmation, preview gating, owner separation, expiry, stale commits, failed builds, code/shared-copy rejection, read-only scopes and widget-only token hiding.
- Latest local results: 15 backend/MCP tests and four isolated-preview tests passed; TypeScript and dry-run Worker bundling passed; synthetic OAuth/PKCE/consent/replay/MCP/Durable Object integration, including an outbound GitHub read in the Workers runtime, passed; headless Edge preview controls passed at all five specified widths. The preview packager was tested against synthetic built files, including rejection of a mismatched commit and exclusion of other HTML, JSON and environment files. Cloudflare build records omit `preview_url`; the connector reads the exact version URL from that build's paginated log, validates its hostname and rendered commit, and ignores mutable branch aliases. The regression test covers that actual response shape.
- Hosted sign-in, reads, GitHub draft creation, build and real preview browser checks passed. The owner reported a real ChatGPT connection and preview build starting; a completed real ChatGPT preview and production publication through this connector remain unverified. Do not equate the local simulated UI test with installation in ChatGPT. The browser sign-in repair and tested version are recorded above.
- Full `coze_client` local build was attempted: guards/content/translation checks passed, content fetch 4.7s with zero downloads, but the native Windows prerender process exited 1 without a JavaScript diagnostic partway through guest routes. The subsequent complete hosted Linux preview build and packaging passed. Do not call the failed local build successful.
- Source is tracked separately on the private backup branch linked above. The earlier CMS-hosted OAuth/MCP prototype is backed up on `backup/cms-editor-work-20260929` in `cozmo-coze-ai/pagescms`; it is not the deployed connector and must not be merged or activated as a shortcut to itinerary support.

References: [OpenAI MCP UI](https://developers.openai.com/plugins/build/chatgpt-ui), [OpenAI file inputs](https://developers.openai.com/plugins/reference), [iframe policy](https://developers.openai.com/plugins/app-guidelines), [Cloudflare OAuth provider](https://github.com/cloudflare/workers-oauth-provider), [Cloudflare version URLs](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/).
