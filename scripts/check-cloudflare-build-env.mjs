import { existsSync } from "node:fs";
import { resolve } from "node:path";

// OpenNext embeds all three modes' dotenv contents in its Worker artifact.
// Require a clean build directory; runtime credentials belong in Worker secrets.
const names = [".env", ".env.local", ...["production", "development", "test"].flatMap(mode => [`.env.${mode}`, `.env.${mode}.local`])];
const found = names.filter(name => existsSync(resolve(name)));
if (found.length) {
  console.error(`Cloudflare build stopped: ${found.join(", ")} would be bundled into the Worker. Build from a clean checkout without these files; keep runtime credentials in Cloudflare secrets.`);
  process.exitCode = 1;
} else {
  console.log("Cloudflare build environment: no dotenv files to embed.");
}
