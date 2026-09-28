# COZE Pages CMS

## Scope

This is the internal Next.js CMS for COZE public content. Keep public content, availability, operational state, and payment evidence owned by their authoritative systems.

## Working rules

- Do not deploy, run production migrations, modify production records, or expose secrets without explicit authorization.
- Preserve the existing authentication and authorization boundaries; hiding a control in the UI is not access control.
- Use the existing package manager and scripts. Prefer small, typed changes over broad refactors.
- When changing a shared content schema, update all locale records and consumers together. Do not let a missing value become an invented business fact.
- Read the relevant repository Neon skill before Neon, Postgres, branching, Auth, Data API, or infrastructure work.

## Verification

- Run `npm run lint` for UI or application changes.
- Run `npm run build` for production-path changes. Be aware that the configured `postbuild` runs database migrations; do not run the build against production credentials or an unreviewed database target.
- Use synthetic content and protected environments for write-path testing.

