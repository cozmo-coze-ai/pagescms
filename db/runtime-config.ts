export type CmsHyperdriveBinding = { connectionString: string };

export function databaseOptions(env: Record<string, string | undefined>, hyperdrive?: CmsHyperdriveBinding) {
  // Supavisor ignores default_transaction_read_only in startup options. A
  // preview must not open a production connection and assume it is read-only.
  // Authenticated staging instead uses an isolated DB with this flag disabled.
  if (env.CMS_READ_ONLY === "true") {
    throw new Error("Database access is disabled in the read-only CMS preview");
  }
  const usingHyperdrive = env.CMS_RUNTIME === "cloudflare" && Boolean(hyperdrive?.connectionString);
  const connectionString = usingHyperdrive ? hyperdrive!.connectionString :
    env.SG_POSTGRES_URL ?? env.POSTGRES_URL ?? env.DATABASE_URL;
  if (!connectionString) throw new Error("CMS database connection is not configured");
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Invalid database connection protocol");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const supabase = url.hostname.endsWith(".supabase.com") || url.hostname.endsWith(".supabase.co");
  if (env.CMS_RUNTIME === "cloudflare" && !usingHyperdrive && !local) {
    throw new Error("CMS_DATABASE Hyperdrive binding is required for the Cloudflare database connection");
  }
  if (!usingHyperdrive && url.hostname.endsWith(".pooler.supabase.com") && (!url.port || url.port === "5432")) {
    url.port = "6543";
  }
  let ssl: { ca: string; rejectUnauthorized: true } | undefined;
  if (supabase && !usingHyperdrive) {
    const ca = env.CMS_DATABASE_CA_CERT?.replace(/\\n/g, "\n").trim();
    if (!ca?.startsWith("-----BEGIN CERTIFICATE-----")) {
      throw new Error("CMS_DATABASE_CA_CERT is required to verify the Supabase database connection");
    }
    // pg lets URI SSL options overwrite the explicit ssl object. Do not let
    // legacy sslmode=require/no-verify silently remove CA verification.
    for (const key of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"]) {
      url.searchParams.delete(key);
    }
    ssl = { ca, rejectUnauthorized: true };
  }
  return {
    connectionString: url.toString(),
    ...(ssl ? { ssl } : {}),
    max: 1,
    maxUses: 1,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 5_000,
    allowExitOnIdle: true,
  };
}
