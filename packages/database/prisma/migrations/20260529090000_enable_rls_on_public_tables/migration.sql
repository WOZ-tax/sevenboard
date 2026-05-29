-- Supabase exposes the public schema through PostgREST by default.
-- SevenBoard reads/writes application data through the Cloud Run API using
-- trusted Postgres credentials, so public API roles should not get table access
-- unless explicit RLS policies are introduced later.
--
-- This also covers Prisma's own public._prisma_migrations table, which is
-- reported by Supabase Security Advisor as rls_disabled_in_public.

DO $$
DECLARE
  table_record record;
BEGIN
  FOR table_record IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> 'spatial_ref_sys'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      table_record.schemaname,
      table_record.tablename
    );
  END LOOP;
END $$;
