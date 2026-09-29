// Disposable local PostgreSQL only; never connects to the Supabase project.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { renderCmsRoleSql } from './lib/cms-role-credential.mjs';

const target = { host: '127.0.0.1', port: 55440, database: 'coze_cms_role_test', connectionTimeoutMillis: 5000 };
const admin = new Client({ ...target, user: 'local_admin', password: 'LocalOnlyCmsRoleTest97531' });
const owner = new Client({ ...target, user: 'cms_test_owner', password: 'LocalOwnerOnly97531' });
const password = randomBytes(32).toString('base64url');
const sql = renderCmsRoleSql(readFileSync(new URL('./provision-cms-database-role.sql', import.meta.url), 'utf8'), password);
const app = new Client({ ...target, user: 'coze_cms_runtime', password });
const tables = ['account', 'cms_deploy_trigger', 'cms_editor_invite', 'cms_gpt_key', 'cms_guest_page', 'cms_homepage_content', 'cms_itinerary', 'cms_language', 'cms_proposal', 'cms_proposal_version', 'session', 'user', 'verification'];
const rls = new Set(['account', 'cms_deploy_trigger', 'cms_editor_invite', 'cms_homepage_content', 'cms_itinerary', 'session', 'user', 'verification']);

async function refusedSetup(pattern) {
  await assert.rejects(owner.query(sql), error => pattern.test(error.message));
  await owner.query('ROLLBACK');
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_roles WHERE rolname='coze_cms_runtime'")).rows[0].n, 0);
}
try {
  await admin.connect();
  await admin.query("CREATE ROLE cms_test_owner LOGIN CREATEROLE PASSWORD 'LocalOwnerOnly97531'; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE authenticator;");
  await admin.query('GRANT USAGE, CREATE ON SCHEMA public TO cms_test_owner');
  await owner.connect();
  for (const table of tables) {
    await owner.query(`CREATE TABLE public."${table}" (id serial PRIMARY KEY, value text NOT NULL); INSERT INTO public."${table}" (value) VALUES ('existing'); GRANT SELECT ON public."${table}" TO anon, authenticated;`);
    if (rls.has(table)) await owner.query(`ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY`);
  }
  await owner.query('CREATE TABLE public.bookings (id integer PRIMARY KEY)');

  await owner.query('ALTER TABLE public.cms_language RENAME TO missing_test');
  await refusedSetup(/missing/);
  await owner.query('ALTER TABLE public.missing_test RENAME TO cms_language');
  await owner.query('CREATE POLICY earlier_policy ON public.account FOR SELECT TO anon USING (false)');
  await refusedSetup(/policies changed/);
  await owner.query('DROP POLICY earlier_policy ON public.account');
  await owner.query('GRANT SELECT ON public.bookings TO PUBLIC');
  await refusedSetup(/unrelated tables/);
  await owner.query('REVOKE SELECT ON public.bookings FROM PUBLIC');
  await admin.query('GRANT CREATE ON SCHEMA public TO PUBLIC');
  await refusedSetup(/schema changes/);
  await admin.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  await owner.query('ALTER TABLE public.cms_itinerary DISABLE ROW LEVEL SECURITY');
  await refusedSetup(/row-security settings changed/);
  await owner.query('ALTER TABLE public.cms_itinerary ENABLE ROW LEVEL SECURITY');

  await owner.query(sql);
  await app.connect(); // Real SCRAM login validates our verifier, not a SET ROLE shortcut.
  for (const table of tables) {
    assert.equal((await app.query(`SELECT count(*)::int AS n FROM public."${table}"`)).rows[0].n, 1);
    const id = (await app.query(`INSERT INTO public."${table}" (value) VALUES ('test') RETURNING id`)).rows[0].id;
    assert.equal((await app.query(`UPDATE public."${table}" SET value='updated' WHERE id=$1`, [id])).rowCount, 1);
    assert.equal((await app.query(`DELETE FROM public."${table}" WHERE id=$1`, [id])).rowCount, 1);
  }
  for (const forbidden of [
    'SELECT * FROM public.bookings', 'INSERT INTO public.bookings VALUES (1)',
    'TRUNCATE public.cms_itinerary', 'ALTER TABLE public.cms_itinerary ADD COLUMN forbidden text',
    'CREATE TABLE public.forbidden (id integer)', 'CREATE ROLE forbidden', 'SET ROLE cms_test_owner',
  ]) await assert.rejects(app.query(forbidden), error => error.code === '42501');
  await assert.rejects(owner.query(sql), /already exists/);
  await owner.query('ROLLBACK');
  const policies = (await admin.query('SELECT tablename, roles::text[], cmd FROM pg_policies WHERE schemaname=\'public\'')).rows;
  assert.equal(policies.length, rls.size);
  for (const policy of policies) {
    assert.deepEqual(policy.roles, ['coze_cms_runtime']);
    assert.equal(policy.cmd, 'ALL');
  }
  const attrs = (await admin.query("SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolinherit FROM pg_roles WHERE rolname='coze_cms_runtime'")).rows[0];
  assert.ok(Object.values(attrs).every(value => value === false));
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_auth_members WHERE member='coze_cms_runtime'::regrole")).rows[0].n, 0);
  for (const role of ['anon', 'authenticated', 'authenticator']) {
    assert.equal((await admin.query("SELECT pg_has_role($1, 'coze_cms_runtime', 'MEMBER') AS member", [role])).rows[0].member, false);
  }
  await admin.query('SET ROLE anon');
  for (const table of tables) {
    assert.equal((await admin.query(`SELECT count(*)::int AS n FROM public."${table}"`)).rows[0].n, rls.has(table) ? 0 : 1);
  }
  await admin.query('RESET ROLE');
  const flags = (await admin.query("SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public'")).rows;
  for (const flag of flags) if (tables.includes(flag.tablename)) assert.equal(flag.rowsecurity, rls.has(flag.tablename));
  console.log('PASS: real SCRAM login; 13-table CRUD and sequences; unrelated access/DDL denied; role/policy drift and broad PUBLIC grants roll back; existing access unchanged.');
} finally {
  await Promise.allSettled([app.end(), owner.end(), admin.end()]);
}
