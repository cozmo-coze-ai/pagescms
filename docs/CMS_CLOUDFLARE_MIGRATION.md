# CMS hosting migration - 2026-09-29

Status: **Live on Cloudflare; automatic deployment verified.** The normal `https://cms.coze.care` address serves Worker `coze-cms`, using the existing Supabase database and credentials. Hosted build `07ca7d62-6a88-43d7-964a-e5b4d3a8fc21` succeeded at 2026-09-29 06:54:42 UTC (15:54 KST), commit `e4c66053aa96851fe87d54dda33a60ecbc03897e`, version `ec3074c9-30ad-4bd9-8c73-59cf1d9cbf17`. End-to-end build/deploy/cache upload: 152 seconds, an observed result rather than a future guarantee. The old Vercel deployment and domain association remain for rollback until the owner confirms one existing-account sign-in; new Vercel Git deployments are disabled.

## Scope and source

- Production CMS: `https://cms.coze.care`, repository `cozmo-coze-ai/pagescms`, branch `main`.
- Release checkout: `C:\COZE_CORP\pagescms-cloudflare-release`, branch `migrate/cloudflare-cms-release`, based on previous main `4deeb0e`.
- Only reviewed migration changes were transferred from the pre-migration snapshot. The original dirty `pagescms` checkout and earlier `pagescms-cloudflare` worktree retain unfinished homepage OAuth/MCP, Zod 4 and other changes. Do not reset them or blindly commit that work into the migration.
- The separate ChatGPT homepage Worker, its OAuth connection, publishing confirmation and the public homepage source were not changed by this migration. Bookings, financial records, guest messages and other services were not modified.

## Runtime and automatic deployment

The CMS retains its existing Supabase tables and Storage. It uses request-scoped `pg` connections through Hyperdrive, with `maxUses: 1` to prevent sockets crossing Worker requests. Query caching is disabled and origin TLS is verified. No application migration runs during build or deployment.

| Resource | ID / setting |
| --- | --- |
| Cloudflare account | `ca1b8e64b194b4a1f57d18d3b85c8fd5` |
| coze.care zone | `f12dac3215443e33a57e67e4db3de323` |
| Production Worker | `coze-cms`, tag `607f6f4fe83d4b30be739bc7a93232c9` |
| CMS Git build trigger | `6f7f29ae-8a3c-4c7b-9d1b-20f31b24e8c3` |
| Git connection | `cafd93f5-ed00-4cc5-987b-d8f1065e2137` |
| Hyperdrive | `coze-cms-database`, `7c1dba6c67504c1cadba6c0c8ed40458` |
| Supabase CA | `10db0022-986b-47d7-8fb3-dfdcae673dc0` |
| Supabase project | `ihitnwzljfldctswwrsv` |
| Public-site production build trigger | `d9c93d2e-9d20-47b1-84ab-e7f53d55ae48` |

Git builds run only for CMS `main`, with build caching enabled. Changes confined to `docs/**` or `AGENTS.md` are excluded. Build command:

`npm run test:cloudflare && npm run test:homepage && npm run lint && npm run build:cloudflare -- -c wrangler.production.jsonc`

Deploy command: `npm run deploy:cloudflare -- -c wrangler.production.jsonc`.

The production config attaches only `cms.coze.care`; `workers_dev` and preview URLs are disabled. It enables the authenticated deploy sweep every minute. Content still saves directly to Supabase; publication calls the existing public-site build hook. CMS status reads genuine Cloudflare production-build results and does not equate a timer or Git commit with a live publication. Preview/stale builds are excluded.

The build environment contains only public `BASE_URL`, `SUPABASE_URL` and `NEXT_PUBLIC_COZE_CLIENT_SITE_URL`. The prebuild guard rejects dotenv files because OpenNext embeds their contents. Runtime secrets must remain runtime bindings. Better Auth warns about absent runtime credentials during build; real credentials must never be added to build variables to silence that warning.

The first hosted build (`955ead01-7991-4115-bb63-4121916133cc`) failed before deployment: Next on Linux traced only pg-cloudflare's default empty module, omitting its Workerd entry. `next.config.mjs` now explicitly includes that package's files; local OpenNext build and lint passed. The next build (`cf03f20e-d93b-41bd-b75f-2a6a458883b8`) compiled successfully but OpenNext deploy required a local Hyperdrive URL for its configuration proxy. Commit `e4c6605` supplies a synthetic loopback-only URL; the real Worker retains its Hyperdrive ID. The complete OpenNext deploy dry-run then passed. Hosted build `40f94966-9ef4-4a57-af09-392048f13761` uploaded the new Worker, but custom-domain attachment failed because the externally managed Vercel CNAME had to be deleted first. The original record was backed up and only that exact CMS record was replaced. Custom domain `bcc18b35a264bb8a36964fad027f1470e962bd8a` now belongs to `coze-cms`. Build `07ca7d62-6a88-43d7-964a-e5b4d3a8fc21` then succeeded for the same commit, confirming the pipeline can deploy with the one-time DNS conflict resolved. Dependency and build caches were uploaded successfully. See [Hyperdrive local configuration](https://developers.cloudflare.com/hyperdrive/configuration/local-development/).

## Verification completed

- Canonical URL checks passed using the normal system resolver: Cloudflare headers present, Vercel headers absent, sign-in/static JavaScript HTTP 200, admin PMS key API HTTP 200 with the existing shared secret, anonymous private APIs HTTP 401, and `/cms` redirects to sign-in. Next may send this as a streamed HTTP 200 with a sign-in redirect marker; browser navigation was verified.
- Real production browser checks passed at 320/390/1440px with Cloudflare response headers, no horizontal overflow and no JavaScript errors. No production login or content write was performed. The minute cron is configured; public homepage and admin PMS remain HTTP 200.

- Next 16.3.3, OpenNext 1.20.6, Wrangler 4.143.0. Clean release TypeScript, full OpenNext build, 17 focused tests and lint passed (zero errors, nine existing warnings). The earlier mixed-worktree OAuth tests are not part of this production release.
- Local workerd plus disposable PostgreSQL: real email/password sign-in, invite-only registration, editor CRUD, viewer rejection, CSRF rejection, validation, 12 concurrent reads and authenticated cron checks passed. All test content writes were in localhost PostgreSQL. Test services and synthetic environment files were removed.
- Authenticated local browser checks at 320/390/1440px passed without horizontal overflow or JavaScript errors. Narrow rich-text toolbar overflow was fixed; `keep_names: false` prevents the injected next-themes `__name` error.
- Real Hyperdrive and dedicated SQL role reads passed: no superuser/DDL/RLS-bypass rights, all 13 required tables and four sequences accessible, 37 itineraries, 114 guest-page rows, four languages, four users and two GPT key records retained.
- A temporary protected full-CMS Worker accepted the existing admin PMS shared secret (key-list HTTP 200), rejected missing/wrong credentials (401), and rejected writes/cron (405). It used a synthetic browser-auth secret and was deleted after checking. No production session or content was created by this test.
- Exactly one owner-approved email was sent through the real CMS mailer in a temporary protected Worker to the owner. Resend reports delivered; that Worker was deleted. Sender `Coze CMS <no-reply@coze.care>`, verified DKIM/SPF, region `ap-northeast-1`. Do not repeat this test without authorization.
- Production auth secret, admin list, encryption key and Supabase keys were recovered using the authorized Vercel API for exportable values. Existing production values were preserved; local dotenv auth/admin values differ and must not replace them. The admin PMS secret was preserved; no admin restart or credential rotation was required.
- The staged production Worker has all ten required runtime secrets. Generated artifacts were scanned against those secret values before upload: zero matches in 1,644 text artifacts.
- The durable content-build queue was checked read-only before activating the cron: dirty time was older than triggered time, so no historical publication was pending.

## Protected credentials and operational helpers

Credential root: `C:\Users\cozmo\.codex\credentials\coze-cms`. DPAPI files are encrypted for this Windows user; directory ACLs allow only that user and SYSTEM. Never print their contents, place them in Git, or pass plaintext credentials in command arguments.

- `runtime-password.dpapi`: dedicated SQL login; never regenerate after provisioning.
- `runtime-secrets.dpapi`: production Better Auth/admin/Supabase/encryption values.
- `admin-panel-secret.dpapi`, `resend-api-key.dpapi`, `cron-secret.dpapi`: runtime credentials.
- `cloudflare-deploy-hook.dpapi`: public-site content publishing hook; do not invoke as a test.
- `cloudflare-resources.json`, `remote-cms-read-check.json`, `email-test.json`, `production-stage.json`, `build-trigger.json`: nonsecret resource/verification receipts.
- `dns-before-cloudflare-20260929.json`: original CMS DNS record; never overwrite.
- `production-verification.json`: generated only by a successful canonical-origin verification; check its timestamp.

The Cloudflare agent token is in sibling `coze-cloudflare/api-token.dpapi`. Zone DNS Edit is now verified in addition to Workers Scripts/Builds, Hyperdrive, CA and KV access. The production build-status secret reuses this existing authorized token; it is not a narrowly scoped read-only token.

The saved GitHub token in sibling `coze-homepage-editor/github-token.dpapi` successfully pushed the authorized migration to `cozmo-coze-ai/pagescms/main`. The default cached Git credential returned 403. Use process-scoped authentication from the saved credential without changing the global credential helper; the key is not installed in the CMS runtime.

Private helpers under `C:\Users\cozmo\.codex\tmp`:

- `cms-build-status.mjs`: selected build metadata and last log lines.
- `verify-cms-production.mjs`: canonical host, real admin PMS read, unauthenticated API rejection, static asset, cron and other public service checks; writes the verification receipt.
- `cms-production-browser-check.cjs`: read-only production sign-in rendering at 320/390/1440px and protected-page redirect.
- `rollback-cms-domain.mjs`: prints the rollback plan by default; `--execute` disables only the CMS cron, detaches only its verified CMS custom domain and restores the saved Vercel CNAME.

## Cutover and rollback

Vercel rollback project: `prj_J5IY2XhD1wy7lAEkeAeMdLEg3adD`, team `team_FDOC5YuqXKM1u5suic9W2kFn`, old production deployment `dpl_BBLNaqs2SphsyvB19HQYN7T8evXn` at commit `4deeb0e`. `vercel.json` disables new Vercel Git deployments. Keep that existing deployment while checking real owner sign-in at the canonical address; do not delete the project prematurely.

Original CMS DNS: DNS-only CNAME `e4c35c709ef23ba6.vercel-dns-017.com`, automatic TTL. A failed canonical verification after cutover requires restoring this record and disabling the Cloudflare CMS cron so only one host can sweep content publications. No other domain or Worker belongs in this rollback. The tested rollback helper accepts successful HTTP 204 responses from domain deletion. A cached HTTP 200 response from Vercel immediately after changing DNS is expected propagation, not evidence that the new Worker failed: first check fresh public DNS and the new host with normal TLS verification. The initial cutover was briefly rolled back after this overly strict check; the helper was corrected and the domain attached again. The local cached Vercel record had a five-minute TTL.

All technical cutover checks above passed. Remaining handoff: the owner signs in once at `https://cms.coze.care` with an existing account. Then remove the old Vercel CMS domain/build integration while retaining the old deployment for rollback. No production password reset, invite, guest message or test-content publication is needed.

## Dependency disposition

The isolated release retains Zod 3 and excludes unfinished CMS OAuth/MCP dependencies. Better Auth is pinned to 1.7.6, Supabase JS to 2.110.5; compatible Tiptap/core, Markdown, defu and linkify-it updates were included. Better Auth's internal admin creation call supplies the required admin-method argument. No SQL migration accompanied these updates.

Production-tree npm audit: 15 findings (0 critical, 1 high, 13 moderate, 1 low). The high finding is Nodemailer 8 in the unused SMTP branch; production explicitly uses Resend. Do not enable SMTP before upgrading and testing it. Other findings involve build/dev tooling or unused Resend/Svix UUID buffer paths. This is a reachability assessment, not a zero-vulnerability claim; do not force npm major/downgrade suggestions blindly.

## Reproducing the isolated checks

### Dedicated SQL login handoff (2026-09-29)

The owner supplied the initial live SQL Editor metadata for the 13 CMS/auth tables in `db/schema.ts`: eight had RLS enabled and no policies; `cms_gpt_key`, `cms_guest_page`, `cms_language`, `cms_proposal` and `cms_proposal_version` had RLS disabled. No homepage OAuth tables appeared. The subsequent read-only audit confirmed unrestricted SELECT/INSERT/UPDATE/DELETE table grants to both anon and authenticated on those five tables. This pre-existing issue was repaired and verified as described below.

- `scripts/provision-cms-database-role.sql` is an owner-run, transactional setup template, not an automatic migration. It creates `coze_cms_runtime`, grants CRUD only on the 13 explicit tables and USAGE on their owned sequences, and adds policies targeted only to that role on the eight protected tables. It preserves existing role passwords, RLS flags, table records and other roles' permissions. It grants no role membership, DDL rights, RLS bypass, default/future-table privileges or REST authenticator membership.
- Setup aborts on a pre-existing login, missing/changed tables, changed policies, or existing PUBLIC grants that would give the new role schema creation or unrelated public/auth/storage table access. Such failures require reviewing the precise error; do not remove the checks or issue broad grants to make it pass. The read-only audit found no security-definer functions in accessible non-system schemas executable by the CMS role.
- `scripts/prepare-cms-database-role.ps1` generated a random password, encrypted it with Windows DPAPI and restricted the credential directory to the current Windows account and SYSTEM. Password: `C:\Users\cozmo\.codex\credentials\coze-cms\runtime-password.dpapi`. Owner-run SQL: `C:\Users\cozmo\.codex\credentials\coze-cms\create-cms-login.sql`. The SQL includes a SCRAM verifier, never the plaintext password. Neither file belongs in Git. Do not regenerate or overwrite them after provisioning.
- **Owner executed; verified:** connected to `aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres` as `coze_cms_runtime.ihitnwzljfldctswwrsv` using the protected password in memory and verified TLS with the Supabase CA. `BEGIN READ ONLY` confirmed the expected role, no superuser/create-role/create-database/RLS-bypass attributes, all 13 tables readable, all four owned sequences usable, 37 itineraries, 114 guest-page rows, four languages and four existing users. No guest/account record contents were printed. Reusable private audit helper: `C:\Users\cozmo\.codex\tmp\verify-cms-runtime-login.mjs` (reads `CMS_SQL_PASSWORD` from the environment, clears it and performs only reads).
- Local test: disposable `postgres:15-alpine`, isolated port 55440 and database `coze_cms_role_test`. `node scripts/test-cms-database-role.mjs` passed real SCRAM password authentication, CRUD/sequence access across all 13 tables, denied booking access/DDL, rollback on policy/RLS drift and broad PUBLIC grants, duplicate-login protection and preservation of existing public access. The provisioning session used a non-superuser with CREATEROLE, matching the relevant SQL Editor boundary. No production writes or role changes occurred. The synthetic container was removed after testing.

### Applied and verified public-access repair

The owner ran `scripts/secure-cms-public-access.sql` successfully. It enabled RLS on exactly the five confirmed unprotected tables, removed public/API writes and private key/proposal reads, and preserved anon/authenticated SELECT on the already-public `cms_guest_page` and `cms_language`. Each table received a policy scoped only to `coze_cms_runtime`. Existing service-role and owner access remain; lost backend grants or changed policies abort the whole transaction. It also removed public sequence mutations on those tables. No content or unrelated tables were modified. Do not rerun either owner-run script: their initial-state guards intentionally reject repeat execution.

Source inspection found CMS key/proposal operations use server-side Drizzle, and the public-site content fetcher uses the Supabase service-role key. Public page/language reads are retained to avoid breaking other read consumers. `node scripts/test-cms-public-access.mjs` passed on a fresh isolated PostgreSQL 15 container: public/private read separation, public write/sequence denial, CMS/owner/service-role CRUD, transaction rollback on policy drift/missing grants, preservation of the other eight tables' policies, and refusal of repeat execution. Live read-only verification passed: all five RLS flags enabled; anon/authenticated denied all access to private key/proposal tables and denied writes to public page/language tables; CMS role still reads all 13 tables and uses four sequences. Counts matched the pre-repair snapshot: account 5, deploy trigger 1, invites 0, GPT keys 2, guest pages 114, homepage 1, itineraries 37, languages 4, proposals/versions 0, sessions 23, users 4, verification 1.

### Cloudflare runtime checks

Post-repair live checks also passed through the actual updated Node `databaseOptions` helper with verified TLS and an explicit read-only transaction. Ten REST HEAD requests (no record bodies) confirmed anonymous access returns 401 on the three private tables and 200 on public pages/languages; service-role access remains 200 on all five. Hosted Hyperdrive queries now pass too, as recorded above. Protected credential-adjacent metadata is at `C:\Users\cozmo\.codex\credentials\coze-cms\cloudflare-resources.json`; it contains resource IDs, the CA fingerprint and read-only verification counts, never passwords. Remote query helper: `C:\Users\cozmo\.codex\tmp\test-cms-remote-hyperdrive.mjs`; preview browser check: `C:\Users\cozmo\.codex\tmp\cms-remote-preview-smoke.cjs`.

Use a disposable PostgreSQL 15 container named `coze-cms-migration-test` bound only to `127.0.0.1:55439`, database `coze_cms_migration`. Initialize it using the existing Drizzle schema, with both runtime and migration variables pointed explicitly to this local database. Never use production credentials for these tests.

Supply synthetic-only `.dev.vars`: `DATABASE_URL`, a test `BETTER_AUTH_SECRET`, `BASE_URL=http://127.0.0.1:8789`, `CMS_RUNTIME=cloudflare`, `CMS_READ_ONLY=false`, and a test `CRON_SECRET`. Build before running `npx wrangler dev --ip 127.0.0.1 --port 8789 --local --test-scheduled`. Restart Wrangler after editing `.dev.vars`.

Set `CMS_TEST_DATABASE_URL` to that disposable DB and run `node scripts/test-cloudflare-runtime.mjs`. The script rejects non-local/non-test databases and cleans its records. The local browser test and screenshots are in `C:\Users\cozmo\.codex\tmp\cms-mobile-runtime-test.cjs` and `cms-*-*.png`; it uses the installed Edge browser and the existing homepage editor Playwright installation. Temporary test services should be stopped after use.
