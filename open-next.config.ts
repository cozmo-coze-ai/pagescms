import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Authenticated CMS pages render per request, without shared ISR/data caching.
export default defineCloudflareConfig({});
