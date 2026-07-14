# This fork's deployment: cms.coze.care

This is a fork of [pages-cms/pages-cms](https://github.com/pages-cms/pages-cms),
self-hosted specifically to serve as the editor UI for the COZE Explorer
Program itinerary content at **cms.coze.care**. This file documents *this
specific deployment* — for the app itself, see the upstream `README.md` and
`pagescms.org/docs`.

## What this instance is for

Edits [github.com/cozmo-coze-ai/coze_cms](https://github.com/cozmo-coze-ai/coze_cms)
(a private, content-only repo — markdown + media, no app code). Saves here
commit directly to that repo, which triggers a GitHub Action that redeploys
the public site at [www.coze.care](https://www.coze.care) (a separate repo,
`coze_client`). See `coze_cms/README.md` and `coze_client/README.md` for the
rest of that pipeline.

## Infrastructure

| Piece | Where |
|---|---|
| App code | this repo, fork of upstream pages-cms, pushed to `github.com/cozmo-coze-ai/pagescms` |
| Hosting | Vercel project **`pagescms`**, custom domain `cms.coze.care`, function region `icn1` (Seoul) |
| Database | Supabase Postgres, `ap-northeast-2` (Seoul) — project `coze` (ref `ihitnwzljfldctswwrsv`), env vars `SG_POSTGRES_URL` (Transaction pooler, runtime) / `SG_DATABASE_URL_UNPOOLED` (Session pooler, migrations — not a true direct connection, see `PERFORMANCE-NOTES.md`). Moved from Neon (`pagescms-sin`, Singapore) to avoid Neon's aggressive 5-min autosuspend; Neon is kept running, untouched, as a fallback until Supabase is confirmed stable — see `PERFORMANCE-NOTES.md` for the full migration record. |
| GitHub App | **`coze-cms`** (App ID in Vercel env `GITHUB_APP_ID`), installed **only** on `cozmo-coze-ai/coze_cms` |
| Email | Resend (`RESEND_API_KEY`), sending from `onboarding@resend.dev` (shared/unverified sender — mail sometimes lands in spam; verifying the `coze.care` domain in Resend would fix this but hasn't been done) |

All of the above config lives in the Vercel project's Environment Variables,
not in this repo (`.env*` is gitignored). See `scripts/setup-github-app.mjs`
for how the GitHub App was created.

## Sign-in model (important — non-default for this app)

Editors do **not** use GitHub OAuth. They sign in with a single shared
email, **`cozmo@coze.care`**, via the app's email-one-time-code flow. This
was a deliberate choice: the editors are non-technical and the team did not
want to require them to create/use GitHub accounts.

Consequence: since these editors have no linked GitHub OAuth token, their
writes to `coze_cms` go through the **GitHub App's installation token**
(see `lib/token.ts` → `getToken()`, which falls back from a personal GitHub
token to the installation token when the signed-in user is a `collaboratorTable`
row without a GitHub identity). Commits show author "COZMO AI" regardless of
which human actually made the edit — there is no per-editor git attribution
under this setup, by design/tradeoff, not a bug.

`ADMIN_EMAILS` in Vercel env vars only grants elevated in-app admin rights
(managing settings/other collaborators) — it is unrelated to who can sign in
or edit content.

## Known quirks / gotchas for future maintenance

- **`scripts/setup-github-app.mjs` had two bugs against GitHub's current
  Manifest API**, both patched locally in this fork (not upstreamed as of
  this writing — check if upstream has since fixed these before assuming
  they're still needed on a fresh `git pull`):
  1. `hook_attributes.secret` is no longer an accepted manifest field —
     GitHub now requires setting the webhook secret manually after the app
     is created (Settings → Webhook → Secret).
  2. `default_permissions.email_addresses` is a **user-level** permission
     and isn't accepted inside `default_permissions` (which is
     repo/org-level only) — it must be added manually after creation
     (Settings → Account permissions → Email addresses → Read-only).
- **Runtime queries use the pooled connection string; migrations use the
  non-pooled one — don't mix these up.** `db/index.ts` connects with
  `SG_POSTGRES_URL` (pooled), falling back to the older `POSTGRES_URL` /
  `DATABASE_URL` only for local dev. `drizzle.config.ts` connects with
  `SG_DATABASE_URL_UNPOOLED` (no `-pooler` in the hostname) because the
  pooled string breaks the `postbuild` migration step (`npm run
  db:migrate`, via drizzle-kit) during Vercel builds. Pointing runtime
  queries at the non-pooled string (as this deployment did originally)
  is a well-known cause of sluggish response times on Vercel+Neon — every
  request opens a slow, direct connection instead of reusing a pooled one.
  Don't undo this.
- **The Neon DB region must match the Vercel function region.** This
  project's functions run in `icn1` (Seoul); the original Neon resource
  defaulted to `us-east-1`, so every DB round trip crossed the Pacific —
  a second, compounding cause of the slowness above. Fixed by provisioning
  a new Neon resource in `ap-southeast-1` (Singapore, the closest Neon
  offers to Seoul) and migrating schema + data over. If the Vercel
  function region ever changes, re-check this alignment.
- **`BASE_URL` is required at build time**, not just runtime — omitting it
  fails the build with `Missing BASE_URL. Set BASE_URL in production.`
  during static page collection, not with an obviously-related error.
- There was previously a **second, unrelated Vercel project** that
  auto-imported `cozmo-coze-ai/coze_cms` directly (Vercel's GitHub
  integration can auto-create projects for any repo it can see) and always
  failed to build (`No Next.js version detected` — that repo has no app
  code). It was deleted. If similar phantom failed-build notifications
  reappear, check Vercel's project list for a stray project connected
  directly to `coze_cms`.
- `cms.coze.care`'s DNS is a Cloudflare CNAME to a Vercel-issued
  `*.vercel-dns-*.com` target, **proxy status "DNS only"** (grey cloud) —
  Vercel's own domain verification asked for this explicitly.
