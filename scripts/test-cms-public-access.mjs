// Fresh disposable local container only; includes the dedicated-login checks.
await import('./test-cms-database-role.mjs');
const { default: assert } = await import('node:assert/strict');
const { readFileSync } = await import('node:fs');
const { Client } = await import('pg');
const target = { host: '127.0.0.1', port: 55440, database: 'coze_cms_role_test', connectionTimeoutMillis: 5000 };
const admin = new Client({ ...target, user: 'local_admin', password: 'LocalOnlyCmsRoleTest97531' });
const owner = new Client({ ...target, user: 'cms_test_owner', password: 'LocalOwnerOnly97531' });
const sql = readFileSync(new URL('./secure-cms-public-access.sql', import.meta.url), 'utf8');
const tables = ['cms_gpt_key', 'cms_guest_page', 'cms_language', 'cms_proposal', 'cms_proposal_version'];
const publicTables = new Set(['cms_guest_page', 'cms_language']);

async function withRole(role, operation) {
  await admin.query(`SET ROLE ${role}`);
  try { await operation(admin); } finally { await admin.query('RESET ROLE'); }
}
async function assertUnchanged() {
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[]) AND relrowsecurity", [tables])).rows[0].n, 0);
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='public' AND tablename=ANY($1::text[])", [tables])).rows[0].n, 0);
}
try {
  await admin.connect();
  await owner.connect();
  await admin.query('CREATE ROLE service_role BYPASSRLS; GRANT USAGE ON SCHEMA public TO service_role');
  for (const table of tables) {
    await owner.query(`GRANT ALL PRIVILEGES ON public."${table}" TO anon, authenticated, service_role; GRANT ALL PRIVILEGES ON SEQUENCE public."${table}_id_seq" TO anon, authenticated, service_role`);
  }
  const previousPolicies = (await admin.query("SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname")).rows;
  await owner.query('CREATE POLICY changed_policy ON public.cms_language FOR SELECT TO anon USING (true)');
  await assert.rejects(owner.query(sql), /policies need review/);
  await owner.query('ROLLBACK');
  await owner.query('DROP POLICY changed_policy ON public.cms_language');
  await assertUnchanged();
  await owner.query('REVOKE UPDATE ON public.cms_gpt_key FROM coze_cms_runtime');
  await assert.rejects(owner.query(sql), /Backend permission would be lost/);
  await owner.query('ROLLBACK');
  await assertUnchanged();
  await owner.query('GRANT UPDATE ON public.cms_gpt_key TO coze_cms_runtime');
  await owner.query(sql);

  for (const role of ['anon', 'authenticated']) await withRole(role, async client => {
    for (const table of tables) {
      if (publicTables.has(table)) assert.equal((await client.query(`SELECT count(*)::int AS n FROM public."${table}"`)).rows[0].n, 1);
      else await assert.rejects(client.query(`SELECT * FROM public."${table}"`), error => error.code === '42501');
      for (const write of [
        `INSERT INTO public."${table}" (value) VALUES ('forbidden')`,
        `UPDATE public."${table}" SET value='forbidden'`,
        `DELETE FROM public."${table}"`, `TRUNCATE public."${table}"`,
        `SELECT nextval('public.${table}_id_seq')`,
      ]) await assert.rejects(client.query(write), error => error.code === '42501');
    }
  });
  for (const role of ['coze_cms_runtime', 'service_role', 'cms_test_owner']) await withRole(role, async client => {
    for (const table of tables) {
      assert.equal((await client.query(`SELECT count(*)::int AS n FROM public."${table}"`)).rows[0].n, 1);
      const id = (await client.query(`INSERT INTO public."${table}" (value) VALUES ('test') RETURNING id`)).rows[0].id;
      assert.equal((await client.query(`UPDATE public."${table}" SET value='updated' WHERE id=$1`, [id])).rowCount, 1);
      assert.equal((await client.query(`DELETE FROM public."${table}" WHERE id=$1`, [id])).rowCount, 1);
    }
  });
  const preservedPolicies = (await admin.query("SELECT * FROM pg_policies WHERE schemaname='public' AND NOT (tablename=ANY($1::text[])) ORDER BY tablename, policyname", [tables])).rows;
  assert.deepEqual(preservedPolicies, previousPolicies);
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[]) AND relrowsecurity", [tables])).rows[0].n, 5);
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='public' AND tablename=ANY($1::text[])", [tables])).rows[0].n, 7);
  await assert.rejects(owner.query(sql), /state changed/);
  await owner.query('ROLLBACK');
  console.log('PASS: public/private reads correctly separated; public writes and sequence mutations denied; CMS, owner and service-role CRUD preserved; policy drift/missing grants roll back; repeat execution refused.');
} finally {
  await Promise.allSettled([admin.end(), owner.end()]);
}
