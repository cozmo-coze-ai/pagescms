# COZE Pages CMS

## Scope

This is the internal Next.js CMS for COZE public content. Keep public content, availability, operational state, and payment evidence owned by their authoritative systems.

## Working rules

- For authorized Cloudflare work, read `docs/CLOUDFLARE_AGENT_ACCESS.md` for the protected local credential location and current build-repair handoff. Never store plaintext credentials in this repository or print them.
- For authorized ChatGPT homepage GitHub work, read `docs/GITHUB_HOMEPAGE_AGENT_ACCESS.md` for the encrypted credential location and verified scope. Never copy its plaintext value into repository files or output.

- Do not deploy, run production migrations, modify production records, or expose secrets without explicit authorization.
- Preserve the existing authentication and authorization boundaries; hiding a control in the UI is not access control.
- Use the existing package manager and scripts. Prefer small, typed changes over broad refactors.
- When changing a shared content schema, update all locale records and consumers together. Do not let a missing value become an invented business fact.
- Read the relevant repository Neon skill before Neon, Postgres, branching, Auth, Data API, or infrastructure work.

## Verification

- Run `npm run lint` for UI or application changes.
- Run `npm run build:cloudflare` for hosting/runtime changes. Automatic postbuild migrations were removed; `npm run db:migrate` remains an explicit operation requiring an authorized target. Build in a clean checkout without production `.env` files: OpenNext can bundle loaded environment values. Read `docs/CMS_CLOUDFLARE_MIGRATION.md` for migration status and the remaining activation blockers.
- Use synthetic content and protected environments for write-path testing.

