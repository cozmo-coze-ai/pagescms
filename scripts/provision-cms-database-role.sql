-- Owner-run provisioning, not an automatic application migration.
-- Render the SCRAM placeholder privately before running in Supabase SQL Editor.
-- Based on the owner's 2026-09-29 table/policy inventory. Aborts on drift.
-- Preserves existing passwords, row-security flags, grants and records.
-- References: https://supabase.com/docs/guides/database/postgres/roles
-- https://www.postgresql.org/docs/15/sql-createrole.html
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $cms_setup$
DECLARE
  cms_tables CONSTANT text[] := ARRAY[
    'account', 'cms_deploy_trigger', 'cms_editor_invite', 'cms_gpt_key',
    'cms_guest_page', 'cms_homepage_content', 'cms_itinerary', 'cms_language',
    'cms_proposal', 'cms_proposal_version', 'session', 'user', 'verification'
  ];
  cms_rls_tables CONSTANT text[] := ARRAY[
    'account', 'cms_deploy_trigger', 'cms_editor_invite', 'cms_homepage_content',
    'cms_itinerary', 'session', 'user', 'verification'
  ];
  cms_verifier text := '__CMS_PASSWORD_SCRAM_VERIFIER__';
  cms_table text;
  cms_relation oid;
  cms_rls boolean;
  cms_sequence text;
BEGIN
  IF cms_verifier !~ '^SCRAM-SHA-256\$[0-9]+:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$' THEN
    RAISE EXCEPTION 'Use the privately generated setup file; password verifier is missing.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'coze_cms_runtime') THEN
    RAISE EXCEPTION 'coze_cms_runtime already exists. Stop and verify; do not replace its password.';
  END IF;

  -- Check every relation before creating the login. No wildcard grants.
  FOREACH cms_table IN ARRAY cms_tables LOOP
    cms_relation := pg_catalog.to_regclass(format('public.%I', cms_table));
    IF cms_relation IS NULL THEN
      RAISE EXCEPTION 'Expected CMS table is missing: %', cms_table;
    END IF;
    SELECT relrowsecurity INTO cms_rls FROM pg_catalog.pg_class
      WHERE oid = cms_relation AND relkind = 'r';
    IF NOT FOUND OR cms_rls IS DISTINCT FROM (cms_table = ANY(cms_rls_tables)) THEN
      RAISE EXCEPTION 'CMS table or row-security settings changed: %', cms_table;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid = cms_relation) THEN
      RAISE EXCEPTION 'CMS policies changed; review before proceeding: %', cms_table;
    END IF;
  END LOOP;

  EXECUTE format(
    'CREATE ROLE coze_cms_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 10 PASSWORD %L',
    cms_verifier
  );
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO coze_cms_runtime', current_database());
  GRANT USAGE ON SCHEMA public TO coze_cms_runtime;
  ALTER ROLE coze_cms_runtime SET search_path = pg_catalog, public;
  ALTER ROLE coze_cms_runtime SET statement_timeout = '30s';
  ALTER ROLE coze_cms_runtime SET lock_timeout = '5s';
  ALTER ROLE coze_cms_runtime SET idle_in_transaction_session_timeout = '15s';

  FOREACH cms_table IN ARRAY cms_tables LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO coze_cms_runtime', cms_table);
    -- This is a backend login: the CMS still checks each team member's role.
    -- No policy is granted to anon, authenticated, PUBLIC or authenticator.
    IF cms_table = ANY(cms_rls_tables) THEN
      EXECUTE format(
        'CREATE POLICY coze_cms_runtime_access ON public.%I FOR ALL TO coze_cms_runtime USING (true) WITH CHECK (true)',
        cms_table
      );
    END IF;
    FOR cms_sequence IN
      SELECT pg_catalog.pg_get_serial_sequence(format('public.%I', cms_table), a.attname)
      FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = pg_catalog.to_regclass(format('public.%I', cms_table))
        AND a.attnum > 0 AND NOT a.attisdropped
    LOOP
      IF cms_sequence IS NOT NULL THEN
        EXECUTE format('GRANT USAGE ON SEQUENCE %s TO coze_cms_runtime', cms_sequence);
      END IF;
    END LOOP;
  END LOOP;

  -- PUBLIC grants are inherited even with NOINHERIT. Fail instead of silently
  -- acquiring broad access or revoking permissions used by another system.
  IF has_database_privilege('coze_cms_runtime', current_database(), 'CREATE')
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_namespace n
      WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
        AND has_schema_privilege('coze_cms_runtime', n.oid, 'CREATE')
    ) THEN
    RAISE EXCEPTION 'Existing PUBLIC grants permit schema changes. Review them separately; setup rolled back.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND n.nspname IN ('public', 'auth', 'storage')
      AND NOT (n.nspname = 'public' AND c.relname = ANY(cms_tables))
      AND has_table_privilege('coze_cms_runtime', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  ) THEN
    RAISE EXCEPTION 'Existing PUBLIC grants expose unrelated tables. Review them separately; setup rolled back.';
  END IF;
END
$cms_setup$;

COMMIT;
SELECT 'CMS login created. Ready for the connection check.' AS result;
