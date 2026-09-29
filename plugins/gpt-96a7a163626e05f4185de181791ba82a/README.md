# COZE Homepage Editor — team package

Version 0.3.0, prepared 2026-09-29. This is a locally prepared package, not
evidence of a saved remote update or publication to COZE HOSPITALITY 3.0.
The existing package name, display name, three starter prompts and supplied
COZE icon are preserved.

The package now attaches the registered app through `.app.json`. Its exact
`asdk_app_6abb1da4205c81919a0468aee3675954` ID matches the user's connected-app
details and the installed app's own generated `.app.json`. The public detail
page uses the prefix `plugin_`:
https://chatgpt.com/plugins/plugin_asdk_app_6abb1da4205c81919a0468aee3675954

There is no bundled `mcp.json`, local MCP process, shell hook or credential.
The old CMS connection is superseded by the registered Cloudflare app. A direct
MCP declaration can cause imported plugins to be marked Desktop only, so this
web package uses the documented registered-app mapping instead.

The skill matches the deployed tools: prepare an isolated preview, show the
actual design, ask the requester to confirm, publish that exact change, and
verify its live status. It retains homepage-only restrictions, locked shared
copy, all four languages and mobile-first checks.

Import the prepared archive through the available plugin upload control.
For an existing manually uploaded plugin, use Upload new version if available.
The package name is not a verified backend plugin ID; do not claim an upload
will overwrite an unrelated entry or a Plugin Creator-managed release. Compare
any hosted release before updating it; current remote source was unavailable.

Workspace sharing and app access are separate. A listed plugin does not make
a personal development app accessible to teammates. An eligible workspace
administrator must enable its required app and grant the intended roles access.
Each teammate also needs their own COZE member key; only the owner is currently
provisioned. Never share the owner's key with the team.

Current guidance: https://help.openai.com/en/articles/20001256-plugins-in-chatgpt-and-codex
Packaging: https://developers.openai.com/plugins/build/plugins
