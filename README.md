# Coze CMS

The content editor for [coze.care](https://coze.care), running at
[cms.coze.care](https://cms.coze.care). Started as a fork of
[Pages CMS](https://pagescms.org) but now runs its own custom system:
content lives in Supabase Postgres (not git), sign-in is invite-only
email + password, and the editing UI is the custom "studio" under `/cms`.

## How it works

- **Content**: itineraries and the homepage are rows in Supabase Postgres
  (`db/schema.ts`, CRUD in `lib/content-store.ts`). Media uploads go to
  Supabase Storage (`lib/media-store.ts`).
- **Editing**: the studio at `/cms` (dashboard, itineraries, homepage,
  settings). The entry form is driven by the static schema in
  `lib/cms-config.ts` and the field system in `fields/`.
- **Publishing**: saving published content marks the site dirty and fires
  the coze_client Vercel deploy hook (debounced, with a cron sweep backstop).
  Draft-only edits don't trigger builds.
- **Auth**: better-auth, email + password, invite-only sign-up. Roles
  (`admin` | `editor`) live on the user row; `ADMIN_EMAILS` is the
  bootstrap-owner escape hatch. Managed from `/cms/settings`.

## Database connections

`SG_POSTGRES_URL` is the application runtime connection. On Vercel it must use
Supabase transaction pooler mode (port `6543`); the database client also
normalizes an accidental Supabase session-pooler URL from `5432` to `6543`.
Prepared statements are disabled for transaction mode, and each function
instance keeps at most one short-lived connection.

`SG_DATABASE_URL_UNPOOLED` is used only by Drizzle migrations. Keep it on a
direct or session-mode connection because migrations require session semantics.
