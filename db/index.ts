import "./envConfig";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  var __cozeCmsPostgresClient: ReturnType<typeof postgres> | undefined;
}

const client =
  globalThis.__cozeCmsPostgresClient
  // SG_POSTGRES_URL is the pooled Singapore Neon connection (colocated with
  // the Seoul Vercel function region); POSTGRES_URL/DATABASE_URL are the
  // older US Neon vars, kept only as a fallback for local dev.
  ?? postgres(process.env.SG_POSTGRES_URL ?? process.env.POSTGRES_URL ?? process.env.DATABASE_URL!, {
    // Keep conservative pool size in dev to avoid local connection spikes.
    max: parseInt(process.env.POSTGRES_MAX_CONNECTIONS || "5", 10),
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__cozeCmsPostgresClient = client;
}

export const db = drizzle(client, { schema });
