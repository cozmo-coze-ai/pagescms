# COZE Cloudflare access

The CMS and ChatGPT editor are now maintained together in this repository. CMS code is at the root; editor/plugin code is in `chatgpt-editor/`. Both use separate Cloudflare builds from `main`.

Read [CMS deployment details](CMS_CLOUDFLARE_MIGRATION.md) and [the current ChatGPT editor handoff](CHATGPT_EDITOR_HANDOFF.md) before changing infrastructure. Preserve the existing domains, member connections, runtime secrets and Supabase database. Do not restore the obsolete CMS-hosted OAuth prototype from backup branches.

Protected local credentials, encrypted with Windows DPAPI for the current owner:

- Cloudflare: `C:\Users\cozmo\.codex\credentials\coze-cloudflare\api-token.dpapi`
- GitHub: `C:\Users\cozmo\.codex\credentials\coze-homepage-editor\github-token.dpapi`
- Owner's ChatGPT connection: `C:\Users\cozmo\.codex\credentials\coze-homepage-editor\owner-connection-key.dpapi`
- CMS runtime: `C:\Users\cozmo\.codex\credentials\coze-cms\runtime-secrets.dpapi`

Decrypt only into process memory. Never print values, commit them, pass them as command-line arguments, or add runtime secrets to build variables. Use process-scoped Git authentication without replacing the machine's global credential helper. Each teammate needs their own member identity and key; do not share the owner's connection.
