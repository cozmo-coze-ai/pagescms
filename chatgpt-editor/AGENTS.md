# COZE ChatGPT editor

This independent npm project serves the existing homepage and itinerary MCP/OAuth connection. The canonical source is `cozmo-coze-ai/pagescms`, branch `main`, directory `chatgpt-editor/`. The earlier standalone checkout and `coze_cms` branches are historical backups.

- Preserve the Worker name, OAuth URL, KV namespace, Durable Object identity, Hyperdrive binding and existing runtime secrets. Do not create a replacement app or rotate member keys as part of a routine release.
- Homepage edits remain allowlisted. Existing itinerary content uses current CMS roles and exact revision checks. Keep private previews, explicit requester confirmation and live-revision verification mandatory.
- Do not restore the old CMS-hosted OAuth/MCP prototype or run its migration.
- Run `npm ci --ignore-scripts`, `npm run check`, `npm test` and `npm run build` here. Build is a dry run; publishing uses the separately configured Cloudflare Git trigger after an authorized merge to main.
- For runtime/widget changes also run the relevant existing runtime and mobile widget checks. Hosted verification may create private drafts but must not publish production content as a test.
- Runtime secrets stay in Cloudflare. Never add credentials or production dotenv files to Git or build variables.

See `../docs/CHATGPT_EDITOR_HANDOFF.md` for activation and operational status.
