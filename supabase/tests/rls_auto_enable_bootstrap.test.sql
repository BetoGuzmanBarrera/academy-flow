BEGIN;

SELECT plan(16);

SELECT ok(
  to_regprocedure('public.rls_auto_enable()') IS NOT NULL,
  'rls_auto_enable exists'
);

SELECT is(
  (SELECT l.lanname FROM pg_proc AS p JOIN pg_language AS l ON l.oid = p.prolang WHERE p.oid = to_regprocedure('public.rls_auto_enable()')),
  'plpgsql',
  'rls_auto_enable uses plpgsql'
);

SELECT is(
  (SELECT p.provolatile::text FROM pg_proc AS p WHERE p.oid = to_regprocedure('public.rls_auto_enable()')),
  'v',
  'rls_auto_enable is volatile'
);

SELECT ok(
  (SELECT p.prosecdef FROM pg_proc AS p WHERE p.oid = to_regprocedure('public.rls_auto_enable()')),
  'rls_auto_enable is security definer'
);

SELECT is(
  (SELECT p.prorettype::regtype::text FROM pg_proc AS p WHERE p.oid = to_regprocedure('public.rls_auto_enable()')),
  'event_trigger',
  'rls_auto_enable returns event_trigger'
);

SELECT is(
  (SELECT p.proowner::regrole::text FROM pg_proc AS p WHERE p.oid = to_regprocedure('public.rls_auto_enable()')),
  'postgres',
  'rls_auto_enable is owned by postgres'
);

SELECT is(
  (SELECT p.proconfig::text FROM pg_proc AS p WHERE p.oid = to_regprocedure('public.rls_auto_enable()')),
  '{search_path=pg_catalog}',
  'rls_auto_enable has the expected search_path'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_event_trigger AS e
    WHERE e.evtname = 'ensure_rls'
      AND e.evtevent = 'ddl_command_end'
      AND e.evtenabled = 'O'
      AND e.evtfoid = to_regprocedure('public.rls_auto_enable()')
      AND e.evttags = ARRAY['CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO']::text[]
  ),
  'ensure_rls is enabled with the expected event and tag filter'
);

SELECT ok(
  NOT has_function_privilege('public', 'public.rls_auto_enable()', 'EXECUTE'),
  'PUBLIC cannot execute rls_auto_enable'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE'),
  'anon cannot execute rls_auto_enable'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE'),
  'authenticated cannot execute rls_auto_enable'
);

SELECT ok(
  has_function_privilege('service_role', 'public.rls_auto_enable()', 'EXECUTE'),
  'service_role can execute rls_auto_enable'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version = '20260811063000'
  ),
  'the compatibility bootstrap is recorded in migration history'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version = '20260811063906'
  ),
  'the historical revoke is recorded in migration history'
);

SELECT ok(
  (SELECT version::bigint FROM supabase_migrations.schema_migrations WHERE version = '20260811063000')
    <
  (SELECT version::bigint FROM supabase_migrations.schema_migrations WHERE version = '20260811063906'),
  'the compatibility bootstrap precedes the historical revoke'
);

CREATE TABLE public.rls_auto_enable_probe (id integer PRIMARY KEY);

SELECT ok(
  (SELECT c.relrowsecurity FROM pg_class AS c WHERE c.oid = 'public.rls_auto_enable_probe'::regclass),
  'ensure_rls enables RLS on a newly created public table'
);

SELECT * FROM finish();

ROLLBACK;
