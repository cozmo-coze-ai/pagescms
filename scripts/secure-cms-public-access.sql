-- Owner-run security repair for the five CMS tables verified on 2026-09-29.
-- Blocks public writes and private key/proposal reads; keeps public page reads.
-- No content, passwords, bookings, other tables or existing policies are edited.
-- Supabase roles/RLS reference: https://supabase.com/docs/guides/database/postgres/row-level-security
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $cms_security$
DECLARE
  cms_tables CONSTANT text[] := ARRAY[
    'cms_gpt_key', 'cms_guest_page', 'cms_language', 'cms_proposal', 'cms_proposal_version'
  ];
  cms_public_tables CONSTANT text[] := ARRAY['cms_guest_page', 'cms_language'];
  cms_table text;
  cms_relation oid;
  cms_sequence text;
  cms_role text;
  cms_privilege text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='coze_cms_runtime' AND NOT rolsuper AND NOT rolbypassrls)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role' AND rolbypassrls) THEN
    RAISE EXCEPTION 'Expected backend roles are missing or changed. Review before proceeding.';
  END IF;
  FOREACH cms_table IN ARRAY cms_tables LOOP
    cms_relation := pg_catalog.to_regclass(format('public.%I', cms_table));
    IF cms_relation IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class WHERE oid=cms_relation AND relkind='r' AND NOT relrowsecurity
    ) THEN
      RAISE EXCEPTION 'Expected CMS table or row-security state changed: %', cms_table;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid=cms_relation) THEN
      RAISE EXCEPTION 'Existing CMS policies need review: %', cms_table;
    END IF;
  END LOOP;

  FOREACH cms_table IN ARRAY cms_tables LOOP
    cms_relation := pg_catalog.to_regclass(format('public.%I', cms_table));
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', cms_table);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', cms_table);
    EXECUTE format(
      'CREATE POLICY coze_cms_runtime_access ON public.%I FOR ALL TO coze_cms_runtime USING (true) WITH CHECK (true)',
      cms_table
    );
    IF cms_table = ANY(cms_public_tables) THEN
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon, authenticated', cms_table);
      EXECUTE format(
        'CREATE POLICY coze_cms_public_read ON public.%I FOR SELECT TO anon, authenticated USING (true)',
        cms_table
      );
    END IF;
    -- Keep each existing backend grant, including the public site's build user.
    FOREACH cms_role IN ARRAY ARRAY['coze_cms_runtime', 'service_role'] LOOP
      FOREACH cms_privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
        IF NOT has_table_privilege(cms_role, cms_relation, cms_privilege) THEN
          RAISE EXCEPTION 'Backend permission would be lost on % for %. Repair rolled back.', cms_table, cms_role;
        END IF;
      END LOOP;
    END LOOP;
    FOR cms_sequence IN
      SELECT pg_catalog.pg_get_serial_sequence(format('public.%I', cms_table), a.attname)
      FROM pg_catalog.pg_attribute a
      WHERE a.attrelid=cms_relation AND a.attnum>0 AND NOT a.attisdropped
    LOOP
      IF cms_sequence IS NOT NULL THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM PUBLIC, anon, authenticated', cms_sequence);
        IF NOT has_sequence_privilege('coze_cms_runtime', cms_sequence, 'USAGE')
          OR NOT has_sequence_privilege('service_role', cms_sequence, 'USAGE') THEN
          RAISE EXCEPTION 'Backend sequence access would be lost. Repair rolled back.';
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END
$cms_security$;

COMMIT;
SELECT 'CMS public access secured. Ready for verification.' AS result;
