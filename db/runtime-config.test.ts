import assert from "node:assert/strict";
import test from "node:test";
import { databaseOptions } from "./runtime-config.ts";

const ca = "-----BEGIN CERTIFICATE-----\nsynthetic-test-only\n-----END CERTIFICATE-----";

test("uses the existing Supabase source and transaction pooler", () => {
  const config = databaseOptions({ SG_POSTGRES_URL: "postgres://cms:test@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres", DATABASE_URL: "postgres://other:test@example.com/other", CMS_DATABASE_CA_CERT: ca });
  const url = new URL(config.connectionString);
  assert.equal(url.hostname, "aws-1-ap-northeast-2.pooler.supabase.com");
  assert.equal(url.port, "6543");
  assert.equal(config.maxUses, 1);
});
test("read-only previews never open a database connection, including through Hyperdrive", () => {
  assert.throws(() => databaseOptions({ DATABASE_URL: "postgres://cms:test@localhost/cms", CMS_READ_ONLY: "true" }), /Database access is disabled/);
  assert.throws(() => databaseOptions({ CMS_RUNTIME: "cloudflare", CMS_READ_ONLY: "true" }, { connectionString: "postgres://binding:test@hyperdrive.local/postgres" }), /Database access is disabled/);
});
test("keeps non-Supabase ports and fails closed without credentials", () => {
  assert.equal(new URL(databaseOptions({ DATABASE_URL: "postgres://cms:test@localhost:55432/cms" }).connectionString).port, "55432");
  assert.throws(() => databaseOptions({}), /not configured/);
  assert.throws(() => databaseOptions({ DATABASE_URL: "https://example.com" }), /protocol/);
});

test("Supabase TLS requires its CA and URI parameters cannot downgrade verification", () => {
  const url = "postgres://cms:test@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres?sslmode=no-verify&ssl=false&sslrootcert=wrong&uselibpqcompat=true";
  assert.throws(() => databaseOptions({ DATABASE_URL: url }), /CMS_DATABASE_CA_CERT/);
  const config = databaseOptions({ DATABASE_URL: url, CMS_DATABASE_CA_CERT: ca });
  assert.deepEqual(config.ssl, { ca, rejectUnauthorized: true });
  assert.equal(new URL(config.connectionString).search, "");
});

test("Cloudflare uses only its binding for remote databases and ignores stale env credentials", () => {
  const env = { CMS_RUNTIME: "cloudflare", DATABASE_URL: "postgres://old:test@aws-1-ap-northeast-2.pooler.supabase.com/postgres" };
  assert.throws(() => databaseOptions(env), /CMS_DATABASE Hyperdrive binding/);
  const boundUrl = "postgres://bound:test@hyperdrive.local:5432/postgres";
  const config = databaseOptions(env, { connectionString: boundUrl });
  assert.equal(config.connectionString, boundUrl);
  assert.equal(config.ssl, undefined); // Hyperdrive terminates/verifies origin TLS.
  assert.equal(config.maxUses, 1);
  assert.equal(new URL(databaseOptions({ CMS_RUNTIME: "cloudflare", DATABASE_URL: "postgres://local:test@127.0.0.1:55439/test" }).connectionString).port, "55439");
});
