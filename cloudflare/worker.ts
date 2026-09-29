// OpenNext generates this module during build:cloudflare.
// @ts-ignore OpenNext generates this import after Next's initial typecheck.
import handler from "../.open-next/worker.js";

type Environment = { BASE_URL: string; CRON_SECRET?: string; CMS_READ_ONLY?: string };
type Context = { waitUntil(promise: Promise<unknown>): void };

const cmsWorker = {
  fetch(request: Request, env: Environment, ctx: Context) {
    if (env.CMS_READ_ONLY === "true" && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      return Response.json({ status: "error", message: "This preview is read-only." }, { status: 403 });
    }
    return handler.fetch(request, env, ctx);
  },
  async scheduled(_event: unknown, env: Environment, ctx: Context) {
    if (env.CMS_READ_ONLY === "true") return;
    if (!env.CRON_SECRET) throw new Error("CMS deploy sweep is not configured");
    const request = new Request(new URL("/api/cron/deploy-sweep", env.BASE_URL), {
      headers: { authorization: `Bearer ${env.CRON_SECRET}` },
    });
    const response = await handler.fetch(request, env, ctx);
    if (!response.ok) throw new Error(`CMS deploy sweep failed (${response.status})`);
  },
};

export default cmsWorker;
