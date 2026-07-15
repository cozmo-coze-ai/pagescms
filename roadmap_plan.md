# pagescms Roadmap — Supabase-native CMS for COZE editors

## Goal

`pagescms` (fork of pages-cms) is the internal editor tool for the COZE guest-manual content
(itineraries + homepage), used by non-technical editors at `cms.coze.care`. Today it is a
git-based CMS: every save commits to the `cozmo-coze-ai/coze_cms` GitHub repo, and the public
site (`coze_client`, www.coze.care) rebuilds from that repo via a GitHub Action → Vercel deploy
hook. Editors sign in with a single shared email + OTP/password.

**We are removing GitHub from the pipeline entirely.** Supabase already hosts the app's auth DB
(Postgres) — we're extending it to hold content too (Postgres for structured itinerary/homepage
data, Supabase Storage for media), so editors write directly to Supabase with no git/GitHub
involved. This also permanently fixes a live production bug: post-login GitHub API calls
("bad credentials") were breaking the editor after sign-in because the GitHub App's
installation-token machinery had drifted out of sync — removing GitHub removes that entire class
of failure.

Superseded/current plan (schema, `cms_`-prefixed naming, `/cms/` routes, auth simplification):
`/Users/nishat_coze/.claude/plans/joyful-knitting-graham.md`
(earlier draft, mostly folded into the above: `joyful-knitting-graham-agent-a1895944c66e93dbd.md`)

---

## What's done

**Schema (renamed to `cms_` prefix per the current plan):**
- [x] `db/schema.ts` — `cms_itinerary` table (slug, title, category, tag, tagColor, coverPath,
      published, body, timestamps, updatedBy) and `cms_homepage_content` table (singleton row,
      `data` jsonb) via Drizzle.
- [x] `db/migrations/0013_empty_forge.sql` — generated (SQL ready, **not yet applied** to
      production Supabase — see "What's left" below).
- [x] `lib/supabase-storage.ts` — Supabase Storage client (service-role, server-only) and
      `ITINERARIES_MEDIA_BUCKET` constant added.
- [x] `@supabase/supabase-js` installed as a dependency.
- [x] `.env.local.example` — documented `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.
- [x] Deleted the unrelated, abandoned Strapi scaffold at `coze_client/cms/` (housekeeping,
      staged for deletion — not yet committed).

**Content-store layer (additive, doesn't touch the old GitHub-backed routes):**
- [x] `lib/cms-config.ts` — static schema for `itineraries` + `homepage`, shaped like the old
      parsed `.pages.yml`, so `fields/registry.ts` keeps working unmodified.
- [x] `lib/content-store.ts` — Postgres-backed CRUD: list/get/create/save/rename/delete
      itineraries, get/save homepage. Reuses the existing field validation/transform pipeline
      (`generateZodSchema`, `deepMap`, `readFns`/`writeFns`).
- [x] `lib/media-store.ts` — Supabase Storage CRUD for the `itineraries-media` bucket: list,
      upload, delete, and a folder rename used when an itinerary's slug changes.
- [x] `app/api/cms/**` routes — new, additive route tree calling the above: `itineraries`
      (list/create), `itineraries/[slug]` (get/save/delete), `itineraries/[slug]/rename`,
      `homepage`, `media/[slug]` (list/upload), `media/[slug]/[filename]` (delete).

None of the above changes live app behavior yet — the old `[owner]/[repo]/[branch]` GitHub-backed
routes are still what the UI actually calls. Safe to leave mid-flight; nothing is wired up or
deployed.

---

## What's left

### Infra — done
- [x] `npm run db:migrate` applied against real Supabase — `cms_itinerary` + `cms_homepage_content`
      tables exist.
- [x] `itineraries-media` Storage bucket created (public-read).
- [x] `.env.local` has correct `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (real service_role,
      not anon), `SG_DATABASE_URL_UNPOOLED`.
- [ ] Still needed: add `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` to **Vercel** env vars for
      both `pagescms` and `coze_client` projects (only done locally so far) before either can
      deploy successfully.
- [x] Migration `0014_green_mastermind.sql` (`cms_deploy_trigger` debounce table) applied to
      production Supabase — verified 2026-07-15: table exists and its row shows a deploy trigger
      fired 2026-07-14 21:14 UTC, i.e. a real save has already POSTed the coze_client deploy hook.

### Done — pagescms full cutover (content + routes + auth, together)
- [x] `lib/content-store.ts`, `lib/media-store.ts`, `lib/cms-config.ts` — Supabase-backed CRUD.
- [x] `app/api/cms/**` — new route tree (itineraries, homepage, media) calling the above.
- [x] `app/(main)/cms/**` pages — itineraries list/new/edit, homepage editor. Purpose-built and
      lean rather than a straight port of the old `components/entry`/`components/collection`
      — reuses `components/entry/entry-form.tsx` (the underlying field-rendering engine, fully
      git-agnostic) directly.
      **Image picker: built** (2026-07-15, closing the earlier known gap): `cover` is a real
      `image` field again and rich-text inline images work. `components/media/media-dialog.tsx`
      is a purpose-built Supabase Storage browser (list/upload/select/delete against
      `/api/cms/media/[slug]`, slug from the route via `useParams`); `media-upload.tsx`
      drag-drop rewired to multipart POST; `lib/media-path.ts` now really maps both stored
      path shapes (cover bucket keys `<slug>/<file>`, body site paths
      `/itineraries/<slug>/<file>`) to public Storage URLs — `NEXT_PUBLIC_SUPABASE_URL` is
      inlined from `SUPABASE_URL` via next.config.mjs, no new env var. `media-store.ts`
      sanitizes upload filenames server-side (same rule as the migration script — non-ASCII
      keys are rejected by Storage). On the "new itinerary" page uploads are disabled with a
      "save first" hint (media is stored per slug). Verified: tsc + `next build` green, and
      generated public URLs return 200 against the real bucket for both conventions.
- [x] **Auth simplified** (`lib/auth.ts`, `components/sign-in.tsx`): dropped GitHub OAuth and
      email-OTP entirely. Email+password only. `lib/auth.ts` went from ~185 lines (GitHub
      profile sync, legacy stub repair, installation tokens) to ~25.
- [x] **Old GitHub-backed route tree deleted** (~28 files): `app/(main)/[owner]/[repo]/[branch]/**`,
      `app/api/[owner]/[repo]/[branch]/**`, `app/api/repos/**`, `app/api/github-app/**`,
      `app/api/webhook/**`, `app/api/collaborators/**`, `app/api/collaborator-invites/**`,
      `app/(auth)/sign-in/collaborator/**`.
- [x] **Dead supporting code deleted**: `components/repo/**` (repo picker/sidebar UI),
      `components/collaborators.tsx`, `components/invite-sign-in.tsx`,
      `components/otp-verification-form.tsx`, `components/github-auth-expired.tsx`,
      `components/entry/entry.tsx` (old git-shaped wrapper — `entry-form.tsx`, the reusable part,
      kept), `components/collection/collection.tsx`, `components/media/media-view.tsx`,
      `components/settings/identities.tsx`, `components/settings/installations.tsx`,
      `components/actions/actions-page.tsx`, `components/cache/cache-page.tsx`; `lib/token.ts`,
      `lib/github-account.ts`, `lib/github-legacy-stub-repair.ts`, `lib/authz-shared.ts`,
      `lib/authz-server.ts`, `lib/github-app.ts`, `lib/github-auth.ts`, `lib/github-auth-server.ts`,
      `lib/github-webhook-*.ts`, `lib/github-cache-*.ts`, `lib/collaborator-access.ts`,
      `lib/api-repo-context.ts`, `lib/accounts.ts`, `lib/commit-message.ts`, `lib/config.ts`,
      `lib/config-store.ts`, `lib/utils/octokit.ts`, `lib/serialization.ts`,
      `lib/actions/collaborator.ts`, `lib/actions/template.ts`, `scripts/setup-github-app.mjs`.
      `lib/github-image.ts` was **kept but renamed to `lib/media-path.ts`** and trimmed — its
      pure path-prefix-swap helpers (used by `fields/core/image`/`rich-text`) are still needed;
      its GitHub-private-repo raw-URL translation became simple pass-throughs (Supabase Storage
      URLs are already public, no translation needed).
- [x] `app/(main)/layout.tsx`, `app/(main)/page.tsx` — dropped GitHub account fetching (`/`  now
      just redirects to `/cms`); `app/(main)/settings/page.tsx` — dropped the GitHub
      identity/installations cards, kept just the profile-name editor.
- [x] `@octokit/app`, `@octokit/rest`, `@ltd/j-toml` removed from `package.json` (were only used
      by files just deleted).
- [x] **Verified**: `tsc --noEmit` clean, full `next build` (dummy env vars, not deployed)
      succeeds — route tree now: `/`, `/cms/**`, `/api/cms/**`, `/settings`, `/sign-in`, `/admin`,
      `/auth/redirect`. No dangling imports.
- [x] Editor invite flow — **built** (2026-07-15): "set your password" invite link, flat
      permissions, no per-repo ACL. Pieces: `cms_editor_invite` table (migration
      `0015_clumsy_joystick.sql` — **applied to prod 2026-07-15**, table + indexes verified); `lib/actions/editor-invite.ts` (create/revoke [admin-only] +
      public accept); "Editors" card on `/admin` (invite by email, copy link, revoke; emails
      the link via lib/mailer if a provider is configured, otherwise link-only); public
      `/sign-up/invite/[token]` page (name + password → account created + signed in via
      better-auth signUpEmail, invite marked accepted). **Security**: lib/auth.ts now has a
      before-hook making sign-up invite-only — the public /api/auth/sign-up/email endpoint
      returns 403 without a valid matching token (verified live against the dev server);
      previously anyone could self-register into a flat-permission editor. Also cleaned the
      stale emailOTP plugin out of lib/auth-client.ts. Migration applied, so /admin's invites card
      works against prod.
- [x] Swap the deploy trigger: pagescms save handler POSTs to the coze_client Vercel deploy hook
      directly, replacing `coze_cms`'s GitHub Action — **built**. `content-store.ts`'s
      `triggerCozeClientDeploy()` is fire-and-forget after every mutation (`saveItinerary`,
      `saveHomepage`, `createItinerary`, `deleteItinerary`, `renameItinerary` — all 5 call it).
      Debounced to at most one rebuild per 5 minutes via a singleton DB row
      (`cms_deploy_trigger`, migration `0014_green_mastermind.sql`) rather than in-memory, since
      saves run across separate serverless invocations. Reads `COZE_CLIENT_DEPLOY_HOOK_URL`
      (documented in `.env.local.example`); if unset it silently no-ops, so saves still succeed
      with no deploy. Because coze_client is a static build, cms->client is eventually-consistent
      (save -> up-to-5-min debounce -> ~1-3 min rebuild -> live), not instant.
      **Still user action to activate in prod:** create the Vercel deploy hook on coze_client, set
      `COZE_CLIENT_DEPLOY_HOOK_URL` in the pagescms Vercel env, and apply migration 0014 to
      production Supabase (else the trigger throws -> caught+logged, save succeeds, no rebuild).
- [ ] DB cleanup migration: `db/schema.ts` still has the GitHub-era tables
      (`github_installation_token`, `collaborator`, `collaborator_invite`, `config`, `cache_file`,
      `cache_file_meta`, `cache_permission`, `action_run`, `user.github_username`) — **not
      dropped yet**, deliberately deferred since nothing references them except
      `app/(main)/admin/page.tsx` (a user-management dashboard that still shows GitHub-linkage
      stats). Harmless to leave for now (unused, no broken imports), but `admin/page.tsx` should
      be simplified and this migration written before calling the cutover fully done.

### One-time data migration
- [x] `pagescms/scripts/migrate-content-to-supabase.mjs` — written and **dry-run verified against
      the real cached `coze_cms` checkout**: found 32 itinerary markdown files, 453 media files
      across 33 folders, homepage.json present, zero slug/filename mismatches (matches the
      figures already recorded in the plan doc). Standalone script (no `@/` path aliases — plain
      `postgres`/`@supabase/supabase-js`/`yaml` deps) so it runs directly via `node`, no build
      step needed. Mirrors `coze_client/scripts/fetch-content.mjs`'s source resolution
      (`COZE_CONTENT_DIR` / sibling checkout / git clone). Upserts by slug, Storage upload uses
      `upsert: true` — safe to re-run.
- [x] **Infra done and migration applied for real**: DB migration run (`cms_itinerary` +
      `cms_homepage_content` tables exist), `itineraries-media` bucket created (public), correct
      `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`SG_DATABASE_URL_UNPOOLED` in `.env.local`
      (caught and fixed two credential mistakes along the way: `SUPABASE_URL` had a stray
      `/rest/v1/` suffix, and the first `SUPABASE_SERVICE_ROLE_KEY` pasted was actually the
      `anon` key — verified by decoding the JWT's `role` claim).
      Ran `--apply`: **32/32 itineraries, homepage, and 453/453 media files migrated**
      successfully. Along the way, fixed two real bugs found during the real run:
      1. `cover_path` was being stored as `itineraries/<slug>/<file>` (stray extra segment)
         instead of the correct bucket-relative `<slug>/<file>` — would have silently broken
         every cover image. Fixed and re-verified (spot-checked rows + confirmed the public
         Storage URL for a migrated cover actually resolves with `curl`).
      2. 30 media files failed to upload with "Invalid key" — Supabase Storage rejects
         non-ASCII/special characters (Korean text, fullwidth chars, parentheses, spaces) in
         object keys. Added a `sanitizeFilename()` step that renames only filenames that need
         it, and rewrites the corresponding references in `cover_path` and inline body markdown
         image links to match — re-ran clean, 453/453 uploaded.
      Script is idempotent (upsert by slug, Storage `upsert: true`) so safe to re-run if more
      content lands in `coze_cms` before the deploy-hook/cutover work below is finished.

### coze_client reads from Supabase
- [x] Rewrote `coze_client/scripts/fetch-content.mjs` to query Supabase (`cms_itinerary`,
      `cms_homepage_content` tables + `itineraries-media` Storage) via `@supabase/supabase-js`
      (added as a dependency, along with `yaml` for re-serializing frontmatter), instead of
      git-cloning `coze_cms`. Materializes the exact same on-disk shape
      (`.content/content/itineraries/*.md`, `.content/content/homepage.json`,
      `public/itineraries/<slug>/<file>`) so `src/content.config.ts` and every Astro page
      downstream need **zero changes** — verified by diffing: `content.config.ts` untouched.
      Uses `SUPABASE_SERVICE_ROLE_KEY` (trusted server-side build step, never shipped to the
      browser) rather than an anon key, to sidestep needing RLS/grants configured on tables
      that Drizzle (not Supabase's dashboard) created.
      Kept `COZE_CONTENT_DIR` as a legacy local-dir escape hatch (reads a git checkout from
      disk) for offline dev without Supabase credentials — **verified working** against the
      real cached `coze_cms` checkout (32 itineraries). Removed the old `git clone` codepath
      entirely (no more `CONTENT_REPO`/`CONTENT_REPO_TOKEN`/`CONTENT_REPO_BRANCH` env vars).
      The Supabase codepath itself is untested end-to-end (no real Supabase credentials in this
      environment) — errors cleanly with a clear message when `SUPABASE_URL`/
      `SUPABASE_SERVICE_ROLE_KEY` are missing; needs a real run once the DB migration + bucket
      + Phase-1 data migration are done.
- [x] **Supabase read path validated for real** (2026-07-15, locally — the Vercel preview
      would just repeat this with the same env vars): `fetch-content.mjs` ran clean against
      production Supabase (32 itineraries, 499 media objects synced, 0 pruned), full
      `npm run build` produced 45 pages in ~2s, and spot-checks confirmed built itinerary
      pages reference `/itineraries/<slug>/<file>` images that exist in `dist/`.
- [ ] Validate parity in a Vercel preview build against the migrated data before touching
      production. Cut production over (env var swap: add `SUPABASE_URL` +
      `SUPABASE_SERVICE_ROLE_KEY` to the coze_client Vercel project, remove the old
      `CONTENT_REPO*` vars), timed close to the pagescms cutover so there's no window where
      editors save but the site doesn't reflect it.

### coze_cms GitHub repo retirement (policy decision, not engineering — last)
- [ ] Keep `cozmo-coze-ai/coze_cms` as a read-only backup for a retention window (recommended:
      90 days) after the cutover is confirmed stable in production, then decide on deletion.
      Archive the repo and remove its now-dead `trigger-deploy.yml` workflow.

---

## Sequencing (why this order) — status

1. **Schema + content-store layer** — done.
2. **`/cms/` pages** — done, verified compiling/building.
3. **Data migration script** — written, dry-run verified against real data, **not yet run with
   `--apply`** (blocked on you applying the DB migration + creating the bucket).
4. **coze_client Supabase read** — code done, **not yet validated end-to-end** (no real Supabase
   credentials exercised yet) or deployed to a preview.
5. **The cutover** (auth simplification + old route deletion) — **done locally**, not deployed.
   Note: this was sequenced *before* the data migration actually ran and before coze_client's
   Supabase path was live-tested, which is a deviation from the original "nothing gets deleted
   until proven" plan — done at your explicit confirmation given the auth/route changes are one
   local `git diff`/`git checkout` away from reverting if the Supabase path turns out to have
   issues once tested for real. **Recommend testing end-to-end (real DB migration → real
   itinerary edit/save → real coze_client build) before committing/pushing any of this.**
6. **Deploy-hook swap** — built (see "What's left"); needs the Vercel deploy hook + env var
   + migration 0014 applied to go live. **Invite flow, DB cleanup migration** — not built yet.
7. **Repo retirement** — a judgment call once the cutover has soaked in production.
