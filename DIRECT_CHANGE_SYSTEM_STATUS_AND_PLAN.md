# COZE direct editing from ChatGPT — status and handoff

Status: **implemented and locally verified; not set up for production** (2026-09-28).

The goal is for a trusted founder or designer to ask a private ChatGPT to make
an editorial change without asking a developer to edit and deploy it. This is
not unrestricted AI access to the website. Each direct action has a narrow,
authenticated API and a versioned source of truth.

```text
Founder/designer → private ChatGPT Action → cms.coze.care API
  → itinerary: CMS database → Cloudflare Workers Builds deploy hook
  → homepage (layout, CSS, 4-language copy, images): GitHub commit → Cloudflare Workers Builds Git integration
  → www.coze.care, only after a successful build and public verification
```

The source idea is in `/Users/nishat_coze/Downloads/direct_change_from_chatbot.pdf`.
The API contract is `gpt-actions-openapi.yaml`; configuration instructions are
in `CHATGPT_EDITOR_SETUP.md`.

## What has been built locally

| Area | Current implementation | Important limit |
| --- | --- | --- |
| ChatGPT connection | OpenAPI schema for a private GPT Action; bearer-token authentication on `/api/agent/*` | The GPT and token are not configured in production |
| Itineraries | Read/list endpoints and `POST /api/agent/itineraries/apply`; checks `expectedUpdatedAt`, saves the full entry, publishes it, and requests a Cloudflare rebuild | One itinerary at a time; a successful save is not proof of a successful build |
| Itinerary history | `cms_proposal` and `cms_proposal_version` hold before/after snapshots; CMS has a proposals/history screen | Requires migration `db/migrations/0021_vengeful_callisto.sql` before use |
| Homepage (2026-09-28) | `/api/agent/homepage/*`: read files, check (dry run + summary the designer confirms), apply edits (whole file or find/replace) plus images attached in ChatGPT as one fast-forward commit, build/live status, undo. Rules in `lib/homepage-guard.ts` (tests: `npm run test:homepage`); matching generated rules fail the coze_client build (`check:homepage`) | Homepage only. Shared copy and executable Astro are frozen. Local client build passes; changes still need isolated release/testing |
| Deploy trigger | CMS can use `COZE_CLIENT_CLOUDFLARE_DEPLOY_HOOK_URL`; failed hook responses release the deploy claim for retry | Hook acceptance is not build success. The sweep is manual, not a scheduled guarantee |
| Guardrails | Authentication, constrained input, stale-version checks, restricted homepage file, no payment/booking/guest-message operations | One shared GPT token does not prove which individual asked for a change |

No repository changes from this work have been pushed or deployed. The
`pagescms` worktree is modified and contains untracked implementation files;
the existing `coze_client` worktree also has unrelated Stay edits, which must
be preserved. Do not treat a local build as a live release.

## What was verified

- CMS TypeScript check and lint passed (lint reports seven existing warnings,
  no errors).
- The ChatGPT OpenAPI YAML parsed, and `git diff --check` passed.
- `npx next build` passed with synthetic environment values. This intentionally
  bypassed `npm run build`, whose `postbuild` runs database migrations.
- Earlier protected/local checks exercised the proposal migration and draft
  behavior. No production database, GitHub write, Cloudflare deploy, or
  end-to-end GPT-to-public-site test has been performed.

## What is still missing

1. **Release preparation:** review the uncommitted CMS and client diffs,
   migration, API scopes, and release process. Keep them isolated from unrelated
   client work.
2. **Protected end-to-end test:** use a test CMS database, test GitHub branch,
   and non-public Cloudflare target. Exercise successful changes, bad tokens,
   stale versions, malformed CSS/content, failed hook/GitHub responses, failed
   builds, and rollback. Local compilation alone is insufficient.
3. **Production configuration:** with explicit authorization, apply the CMS
   migration, create the private GPT from `gpt-actions-openapi.yaml`, and set
   `COZE_GPT_ACTION_TOKEN` and `COZE_GPT_ACTION_ACTOR_EMAIL` as CMS secrets.
   Give the GPT only to trusted editors; do not paste secrets into prompts.
4. **Deployment wiring:** create and verify a Cloudflare Workers Builds hook
   for CMS content edits. For CSS commits, verify that the correct GitHub repo
   and production branch actually trigger a Cloudflare build before setting
   `COZE_CLIENT_CLOUDFLARE_GIT_DEPLOY_ENABLED=true`. Set the repo/token/branch
   values described in `CHATGPT_EDITOR_SETUP.md`. These connections are not
   currently verified.
5. **Release the CMS:** push/deploy only after an explicit production-release
   decision, then test the authenticated read/write Actions against the live
   CMS with a safe test item. Confirm the resulting Cloudflare build and the
   actual page at `www.coze.care` before calling the feature operational.
6. **Finish the owner-facing feedback loop:** the current CMS deploy-status
   endpoint (`app/api/cms/deploy-status/route.ts`) still consults the old
   Vercel-status module. Replace it with Cloudflare build status, expose
   `queued/building/failed/live` to the GPT and CMS, and verify the public
   page. Until then, the Action reports only `saved` or `committed`.
7. **Homepage editing is built and locally tested** (layout, design, copy,
   images; see `CHATGPT_EDITOR_SETUP.md`). Still to do: release both repositories
   to isolated test branches, run the sandbox end-to-end test with the real GPT,
   then complete the activation steps. Other pages remain out of scope.

## Definition of “all set up”

The answer becomes **yes** only when a trusted editor can make an allowed
test change in ChatGPT, the API records a version, the correct Cloudflare build
succeeds, the expected change appears on the public site, a failure is shown
as a failure, and an earlier version can be restored. That has **not** been
demonstrated yet.

## Operating rules after activation

- Always read the current item/commit first. Stale writes return `409` and
  require a fresh read; never blindly retry a full replacement.
- Do not invent prices, availability, services, or claims. A draft itinerary
  sent to the direct action becomes published.
- A change ID or Git commit is a version marker, not evidence of deployment.
- For rollback, restore the previous itinerary snapshot or revert the specific
  Git commit, then run and verify a new Cloudflare build. Rollback is a new
  change, not deletion of history.
- If the deploy hook fails, the CMS retains a dirty state for a later retry;
  the manual `/api/cron/deploy-sweep` backstop currently requires an operator.
- Rotate the shared GPT token when access changes. Per-editor attribution
  requires a future OAuth or individual-credential design.

Production migration, secrets, GitHub writes, push, deployment, and DNS
changes are **not** authorized by this document and were not performed here.
