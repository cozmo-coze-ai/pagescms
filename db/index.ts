import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { cache } from "react";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";
import { databaseOptions, type CmsHyperdriveBinding } from "./runtime-config";

// Cloudflare cannot reuse TCP connections across requests. React caches only
// within a server render; route handlers get fresh pools. maxUses=1 closes a
// connection after release, including after a complete transaction.
export const getDb = cache(() => {
  const binding = process.env.CMS_RUNTIME === "cloudflare" && process.env.CMS_READ_ONLY !== "true"
    ? (getCloudflareContext().env as { CMS_DATABASE?: CmsHyperdriveBinding }).CMS_DATABASE
    : undefined;
  const client = new Pool(databaseOptions(process.env, binding));
  client.on("error", () => console.error("[database] idle connection failed"));
  return drizzle(client, { schema });
});

// Callers and Better Auth hold a lazy proxy, never a global TCP pool. Builds
// therefore also remain independent of live database credentials.
export const db = new Proxy({} as ReturnType<typeof getDb>, {
  get(_target, property) {
    const database = getDb();
    const value = Reflect.get(database, property);
    return typeof value === "function" ? value.bind(database) : value;
  },
});
