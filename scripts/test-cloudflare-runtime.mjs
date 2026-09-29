// Run only against the disposable local database and local Wrangler worker.
import assert from "node:assert/strict";
import { Pool } from "pg";
import { hashPassword } from "better-auth/crypto";

const origin = "http://127.0.0.1:8789";
const connectionString = process.env.CMS_TEST_DATABASE_URL;
assert.ok(connectionString, "Set CMS_TEST_DATABASE_URL to the disposable local test database");
const databaseUrl = new URL(connectionString);
assert.equal(databaseUrl.hostname, "127.0.0.1");
assert.equal(databaseUrl.port, "55439");
assert.equal(databaseUrl.pathname, "/coze_cms_migration");
const db = new Pool({ connectionString });
const password = "Local-runtime-test-only-97531";
const suffix = crypto.randomUUID();
const editorId = `migration-editor-${suffix}`;
const viewerId = `migration-viewer-${suffix}`;
const slug = `migration-test-${suffix}`;
const content = { title: "Local test only", slug, category: "tour", published: false, body: "Test content" };

async function call(path, { method = "GET", cookie, body, requestOrigin = origin } = {}) {
  console.log(`${method} ${path}`);
  return fetch(`${origin}${path}`, {
    method, redirect: "manual", signal: AbortSignal.timeout(20_000),
    headers: { origin: requestOrigin, ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function signIn(email) {
  const response = await call("/api/auth/sign-in/email", { method: "POST", body: { email, password } });
  assert.equal(response.status, 200, `Sign-in failed: ${await response.text()}`);
  return response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
}
try {
  const hashed = await hashPassword(password);
  for (const [id, role] of [[editorId, "editor"], [viewerId, "viewer"]]) {
    await db.query('insert into "user" (id, name, email, email_verified, role) values ($1,$2,$3,true,$4)', [id, `Migration ${role}`, `${id}@example.invalid`, role]);
    await db.query('insert into account (id, account_id, provider_id, user_id, password) values ($1,$1,\'credential\',$1,$2)', [id, hashed]);
  }
  assert.equal((await call("/api/cms/itineraries")).status, 401);
  assert.equal((await call("/api/auth/sign-up/email", { method: "POST", body: { name: "Not invited", email: "uninvited@example.invalid", password } })).status, 403);
  const editor = await signIn(`${editorId}@example.invalid`);
  const viewer = await signIn(`${viewerId}@example.invalid`);
  assert.ok(editor && viewer);
  assert.equal((await call("/api/cms/itineraries", { method: "POST", cookie: editor, body: { content }, requestOrigin: "https://untrusted.invalid" })).status, 403);
  assert.equal((await call("/api/cms/itineraries", { method: "POST", cookie: viewer, body: { content } })).status, 403);
  const create = await call("/api/cms/itineraries", { method: "POST", cookie: editor, body: { content } });
  assert.equal(create.status, 201, await create.text());
  for (let round = 0; round < 3; round++) {
    const reads = await Promise.all(Array.from({ length: 4 }, () => call(`/api/cms/itineraries/${slug}`, { cookie: viewer })));
    for (const read of reads) { assert.equal(read.status, 200); assert.equal((await read.json()).data.contentObject.title, content.title); }
  }
  const invalid = await call(`/api/cms/itineraries/${slug}`, { method: "PUT", cookie: editor, body: { content: { ...content, category: "invalid" } } });
  assert.equal(invalid.status, 400, await invalid.text());
  assert.equal((await call(`/api/cms/itineraries/${slug}`, { method: "PUT", cookie: editor, body: { content: { ...content, title: "Updated locally" } } })).status, 200);
  const saved = (await db.query("select title, updated_by from cms_itinerary where slug=$1", [slug])).rows[0];
  assert.equal(saved.title, "Updated locally");
  assert.equal(saved.updated_by, editorId);
  assert.equal((await call(`/api/cms/itineraries/${slug}`, { method: "DELETE", cookie: viewer })).status, 403);
  assert.equal((await call(`/api/cms/itineraries/${slug}`, { method: "DELETE", cookie: editor })).status, 200);
  assert.equal((await call(`/api/cms/itineraries/${slug}`, { cookie: editor })).status, 404);
  assert.equal((await call("/api/cron/deploy-sweep")).status, 401);
  assert.equal((await call("/api/cms/deploy-status", { cookie: editor })).status, 200);
  console.log("PASS: Cloudflare runtime sign-in, invite restriction, CSRF, viewer permissions, concurrent reads, create/update/delete, validation, and cron authentication.");
} finally {
  await db.query("delete from cms_itinerary where slug=$1", [slug]);
  await db.query('delete from "user" where id = any($1::text[])', [[editorId, viewerId]]);
  await db.end();
}
