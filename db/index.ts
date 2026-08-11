import "./envConfig";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  var __cozeCmsPostgresClient: ReturnType<typeof postgres> | undefined;
}

const rawConnectionString =
  process.env.SG_POSTGRES_URL ?? process.env.POSTGRES_URL ?? process.env.DATABASE_URL!;

// Supabase's shared pooler uses 5432 for session mode and 6543 for
// transaction mode. Vercel functions are transient clients, so session mode
// can exhaust the small per-project session pool even at modest traffic.
const runtimeUrl = new URL(rawConnectionString);
const usesSupabaseSharedPooler = runtimeUrl.hostname.endsWith(".pooler.supabase.com");
if (usesSupabaseSharedPooler && (!runtimeUrl.port || runtimeUrl.port === "5432")) {
  runtimeUrl.port = "6543";
}
const usesTransactionPooler = usesSupabaseSharedPooler && runtimeUrl.port === "6543";

const client =
  globalThis.__cozeCmsPostgresClient
  ?? postgres(runtimeUrl.toString(), {
    // Each serverless instance gets its own client pool. One connection is
    // enough here; Supavisor handles concurrency across instances.
    max: parseInt(process.env.POSTGRES_MAX_CONNECTIONS || "1", 10),
    idle_timeout: parseInt(process.env.POSTGRES_IDLE_TIMEOUT || "20", 10),
    max_lifetime: parseInt(process.env.POSTGRES_MAX_LIFETIME || "1800", 10),
    // Supabase transaction mode does not support prepared statements.
    prepare: !usesTransactionPooler,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__cozeCmsPostgresClient = client;
}

export const db = drizzle(client, { schema });
