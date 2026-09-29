# CMS editor source backup — 2026-09-29

This branch, `backup/cms-editor-work-20260929`, preserves the original working checkout's CMS migration and earlier CMS-hosted homepage MCP/OAuth prototype. Its base is `4deeb0e`. It is not a production release and is not intended for a bulk merge to main.

The reviewed CMS migration is already on `cozmo-coze-ai/pagescms` main through `71ad0c5`. Production `cms.coze.care` runs the Cloudflare release built from `e4c66053aa96851fe87d54dda33a60ecbc03897e`; the later main commits document verification and Vercel cleanup. The owner confirmed that itinerary text and photos load.

The active ChatGPT homepage connector is the separate Cloudflare Worker at `https://coze-homepage-editor.cozmo-ca1.workers.dev/mcp`. Its source is backed up on `backup/homepage-editor-20260929` in the private `cozmo-coze-ai/coze_cms` repository. The saved credential could not access the newly created dedicated `coze_homepage_editor` repository, so that is not the source backup location. The existing workflow plugin is https://chatgpt.com/plugins/plugin_ce7a0f7893008191a2b49a669dea575d and requires its connected MCP app. Both are homepage-only.

Do not activate this branch's `0023_homepage_plugin_oauth.sql` migration or CMS-hosted MCP routes merely because the files are present. That earlier prototype is superseded by the standalone connector. An itinerary MCP connection has not been implemented or attached to ChatGPT. Existing legacy itinerary REST routes do not make the homepage plugin an itinerary editor.

Source verification before backup: `npm run test:homepage`, `npm run test:homepage-mcp`, `npx tsc --noEmit`, and `npm run lint` passed in the original checkout with the same copied source. Lint reported nine warnings and no errors. No production build, migration, content edit, or deployment was performed for this backup.

Credentials, environment files, generated bundles, and local authentication material are excluded. Preserve the original dirty checkout when working with this backup.
