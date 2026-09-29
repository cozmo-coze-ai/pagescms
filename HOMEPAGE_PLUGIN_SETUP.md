# COZE Homepage & Itinerary Editor

Use the existing [COZE app](https://chatgpt.com/plugins/plugin_asdk_app_6abb1da4205c81919a0468aee3675954) and [workflow plugin](https://chatgpt.com/plugins/plugin_ce7a0f7893008191a2b49a669dea575d). They work together; do not create another same-name app.

1. Open the app in the ChatGPT workspace where it was created. Select **Manage app → Refresh tools**.
2. Reconnect if ChatGPT asks for the added itinerary permissions. Use your own COZE connection key in the sign-in form, never in chat.
3. Start a new chat with the plugin. First test: **“Show my homepage connection and list the available itineraries. Do not change or publish anything.”**
4. Request a design or itinerary content change. Inspect the preview, then say yes only when ready to publish.

Supported: homepage layout/CSS, supported images and four-language copy; existing itinerary titles, text, covers/photos, categories/tags and publication state. Bookings, payments, guest messages, other CMS pages and itinerary templates are outside this plugin's scope.

The plugin is still personal. Company sharing requires the workspace owner's plugin-sharing permissions. Every teammate needs their own COZE identity/key and appropriate CMS access; do not share the owner's key.

Source is merged into `pagescms/main`: CMS at the root, connector and plugin bundle in `chatgpt-editor/`. Cloudflare builds and deploys each Worker separately. See [the verified operational handoff](docs/CHATGPT_EDITOR_HANDOFF.md).

Reference: [OpenAI developer connection refresh](https://developers.openai.com/plugins/deploy/connect-chatgpt).
