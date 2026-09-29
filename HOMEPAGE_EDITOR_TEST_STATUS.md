# Homepage Editor client test

> Historical report. For the deployed Cloudflare CMS and combined homepage/itinerary ChatGPT editor, use [the current handoff](docs/CHATGPT_EDITOR_HANDOFF.md). This earlier report describes the superseded GPT Actions setup.

Checked 2026-09-28 (KST). The local implementation now passes its build and
guard tests. **The deployed services are not ready for an authenticated client
test yet.**

## Checks performed

| Check | Result |
| --- | --- |
| Local homepage guard tests | CMS 10/10 and client 4/4 passed, including the earlier executable-code bypass cases |
| Published GPT action schema | HTTP 200; homepage operations present |
| Homepage API without a key | HTTP 401, as expected |
| CMS key-management API | HTTP 503: `COZE_ADMIN_PANEL_SECRET` is not configured |
| Admin key-management API | HTTP 404: route is not available in the deployed admin |
| Local coze_client | Four JSON dictionaries, matching generated rules, build guard and build marker present; full Astro build passed |
| Latest GitHub `cozmo-coze-ai/coze_client` main | `933bb26`: still has TypeScript dictionaries, no homepage JSON/checker files |
| Documented `feat/gpt-homepage` remote branch | Not advertised by that repository at check time |

No publishing, migrations, secret changes, key issuance, or service restarts
were performed. Fetching GitHub main updated a local remote-tracking ref only;
the client's working branch was left unchanged.

Repeat the read-only prerequisites check from `pagescms`:

```powershell
node scripts/check-homepage-editor-setup.mjs
```

Exit 1 means prerequisites failed. Exit 0 means only those prerequisites passed,
not that the complete editor is safe or activated. An isolated setup can use
`--cms-url`, `--admin-url`, and `--client-root` overrides. Never pass credentials.

## Before inviting a client

1. Review and release the completed local client/CMS changes to isolated test
   branches. They are not present in the current deployed GitHub client main.
2. Prepare an isolated CMS/database, test Git branch and preview site. Configure
   its credentials and apply migrations 0021/0022 only to that verified test
   database. Existing production restrictions remain in force.
3. Make the admin key UI available against that test CMS. Issue a test key there.
   The production schema URL points at production; use the test CMS's schema,
   verify its `servers` URL, and give the GPT test-only instructions/URLs.
4. The client creates a private Custom GPT, imports that schema, and enters its
   test key in Actions authentication (API Key / Bearer), never in chat.

## Client acceptance test, in order

1. Ask: "Show the current homepage and the site this editor will change. Do not
   publish anything." Verify the target is the isolated preview.
2. Ask: "Increase the hero button's touch target to at least 44 pixels on mobile.
   Keep the wording, colors, and desktop layout. Check it and show the proposed
   change; do not publish yet."
3. Confirm no Git write occurred before approval. Then explicitly approve that
   exact change **to the test site** and verify the resulting build/commit marker.
4. Inspect 320px and 390px mobile layouts first, then desktop: no overflow,
   readable text, working links, and adequate touch targets.
5. Test a four-language heading edit and an attached image. Check the summary,
   explicit confirmation, final preview, and image alt text.
6. Reject out-of-scope paths/shared copy, missing or false confirmation, stale
   commits, invalid/revoked keys, and unsafe Astro. Exercise a failed build.
7. Approve undo in the test site; verify the restored design and new live commit.

Only after these pass should a separately authorized production activation be
considered. A unit-test pass or reachable schema is not end-to-end proof.
