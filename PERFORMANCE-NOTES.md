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

## Diagnosed but not yet fixed (leave for now, revisit later)

- **GitHub API cache TTLs are short.** `BRANCH_HEAD_TTL_MS` and
  `REPO_META_TTL_MS` in `lib/github-cache-file.ts` default to 15000 (15s).
  That means routine navigation triggers a live round-trip to GitHub's API
  every ~15s just to check branch/repo freshness — a real cost from Seoul.
  Actual file content caches for 24h (`FILE_TTL_MIN=1440`) so that part's
  fine. Fix would be bumping these two env vars (e.g. to 60000–120000ms);
  zero code change, editors here only push through the CMS itself so a
  staler freshness check is low-risk.
- **Neon free-tier autosuspend.** Compute suspends after 5 min of no
  queries; first request after any idle period pays a cold-wake tax on top
  of Vercel's own cold start. For a lightly-used internal tool this could be
  most visits, not an edge case. Two ways to permanently fix, not yet
  chosen:
  1. Free: add a Vercel Cron Job hitting a `SELECT 1` endpoint every ~4 min
     to keep the compute active. No cost, standard pattern for this Neon+
     Vercel combo.
  2. Paid: upgrade off Neon's free plan and disable/extend the autosuspend
     timeout directly (~$19/mo+, no workaround needed).

## Cleanup still owed (unrelated to speed, surfaced during this work)

- **Rotate the Neon Postgres password** — it was pasted into a chat during
  this investigation, treat it as exposed regardless of the "Sensitive" env
  flag.
- **Remove the old `us-east-1` Neon resource** once the Singapore one has
  been stable in production for a while.
- Leftover `.agents/`, `.claude/`, `skills-lock.json` in the repo root —
  auto-installed as a side effect of provisioning the Neon integration via
  CLI, harmless but unused; delete if the clutter bothers you.
- From an earlier session, still not done: verify the `coze.care` domain in
  Resend (invite emails land in spam without it), and rotate the GitHub App
  client secret / Resend API key that were pasted into an earlier chat.
