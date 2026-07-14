# cms.coze.care performance — status and open items

Working notes from a performance investigation. Not exhaustive documentation
(see `DEPLOYMENT-COZE.md` for that) — this is a punch list to pick back up.

## Complaint

`cms.coze.care` felt slow. After the two fixes below, it's better but still
**not fast** — noticeably slower than it should feel for a small internal
CMS.

## Fixed

- **Non-pooled DB connection used at runtime.** `db/index.ts` was using the
  same non-pooled Neon connection string as the build-time drizzle-kit
  migration step, so every request opened a slow, direct Postgres
  connection instead of a pooled one. Fixed: runtime now uses the pooled
  `SG_POSTGRES_URL`; migrations still use the non-pooled
  `SG_DATABASE_URL_UNPOOLED`.
- **Region mismatch.** Vercel functions run in `icn1` (Seoul); the original
  Neon DB defaulted to `us-east-1`, so every query crossed the Pacific.
  Fixed: migrated schema + data to a new Neon resource in `ap-southeast-1`
  (Singapore, the closest Neon offers to Seoul).

Both are live in production as of commit `e62d2f9`.

- **GitHub API cache TTLs were short.** `BRANCH_HEAD_TTL_MS` and
  `REPO_META_TTL_MS` in `lib/github-cache-file.ts` defaulted to 15000 (15s),
  so routine navigation triggered a live round-trip to GitHub's API every
  ~15s just to check branch/repo freshness — a real cost from Seoul. Fixed:
  both set to `120000` (2 min) via Vercel env vars on the `pagescms`
  project (Production). Zero code change; editors here only push through
  the CMS itself so a staler freshness check is low-risk. Takes effect on
  next request, no redeploy needed.
- **Neon free-tier autosuspend.** Compute suspends after 5 min of no
  queries; first request after any idle period pays a cold-wake tax on top
  of Vercel's own cold start. Fixed with the free option: added
  `app/api/cron/keep-alive/route.ts` (runs `SELECT 1`, checks a
  `CRON_SECRET` bearer token that Vercel's cron injects automatically) plus
  a `vercel.json` cron entry hitting it every 4 minutes. `CRON_SECRET` env
  var added to Production. Live as of commit `0824212`. Since the DB moved
  to Supabase (below), this cron now keeps Supabase warm instead — harmless
  either way, and Supabase's own free-tier pause window is 1 week (vs
  Neon's 5 min), so this is now belt-and-suspenders rather than load-bearing.

## Database moved: Neon → Supabase

The runtime and migration DB connection was switched from Neon
(`pagescms-sin`, `ap-southeast-1`) to a new Supabase project (`coze`,
project ref `ihitnwzljfldctswwrsv`, region `ap-northeast-2` — Seoul, an
exact match for the Vercel function region `icn1`, even closer than Neon's
Singapore). Reason: Neon's free-tier autosuspend (5 min idle) was
contributing to the cold-start slowness above; this Supabase project's
autosuspend window is far more forgiving (1 week) and the CMS gets daily
traffic, so it shouldn't be hit in practice.

- Schema recreated on Supabase from `db/schema.ts` via
  `db/supabase-init.sql` (not committed — kept locally; matches the current
  schema exactly, not a replay of the incremental migration history in
  `db/migrations/`).
- All existing data (users, sessions, collaborators, config, file/media
  caches) copied over row-for-row from Neon; serial ID sequences reset to
  match.
- `SG_POSTGRES_URL` (runtime) now points at Supabase's Transaction pooler
  (port 6543); `SG_DATABASE_URL_UNPOOLED` (migrations) points at Supabase's
  Session pooler (port 5432) rather than a true direct connection — Supabase
  direct connections are IPv6-only unless the paid IPv4 add-on is enabled,
  and Vercel's build environment needs IPv4. Session pooler is the
  IPv4-compatible alternative Supabase recommends for exactly this case.
- **Neon (`pagescms-sin`) is intentionally left running, untouched, as a
  fallback** — nothing has been deleted there. Reverting is just swapping
  `SG_POSTGRES_URL` / `SG_DATABASE_URL_UNPOOLED` back to the Neon values.
  Decommission it only once Supabase has been confirmed stable in
  production for a while (see Cleanup below).

## Diagnosed but not yet fixed (leave for now, revisit later)

(none currently — see Cleanup still owed below for unrelated items)

## Cleanup still owed (unrelated to speed, surfaced during this work)

- **Rotate the Neon Postgres password** — it was pasted into a chat during
  this investigation, treat it as exposed regardless of the "Sensitive" env
  flag. Lower urgency now that Neon is no longer the live DB, but still
  exposed as long as that Neon project exists.
- **Rotate the Supabase database password** — same issue, pasted into chat
  twice during the migration above. This one *is* the live DB's password,
  so treat this with more urgency than the Neon one.
- **Delete the Neon project** once Supabase has proven stable in production
  for a while — see "Database moved" section above.
- Leftover `.agents/`, `.claude/`, `skills-lock.json` in the repo root —
  auto-installed as a side effect of provisioning the Neon integration via
  CLI, harmless but unused; delete if the clutter bothers you.
- From an earlier session, still not done: verify the `coze.care` domain in
  Resend (invite emails land in spam without it), and rotate the GitHub App
  client secret / Resend API key that were pasted into an earlier chat.
