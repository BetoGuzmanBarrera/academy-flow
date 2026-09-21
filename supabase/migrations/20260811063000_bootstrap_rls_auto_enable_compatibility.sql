DO $bootstrap_function$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NULL THEN
    EXECUTE $create_function$
CREATE FUNCTION public.rls_auto_enable()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
    $create_function$;
  END IF;
END
$bootstrap_function$;

DO $validate_function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    JOIN pg_language AS l ON l.oid = p.prolang
    WHERE p.oid = to_regprocedure('public.rls_auto_enable()')
      AND n.nspname = 'public'
      AND l.lanname = 'plpgsql'
      AND p.provolatile = 'v'
      AND p.prosecdef
      AND p.prorettype = 'event_trigger'::regtype
      AND p.proowner = 'postgres'::regrole
      AND p.proconfig = ARRAY['search_path=pg_catalog']::text[]
      AND btrim(p.prosrc) = btrim($expected_body$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$expected_body$)
  ) THEN
    RAISE EXCEPTION
      'public.rls_auto_enable() exists but is incompatible with the expected production definition; refusing to overwrite it';
  END IF;
END
$validate_function$;

DO $bootstrap_trigger$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_event_trigger
    WHERE evtname = 'ensure_rls'
  ) THEN
    EXECUTE $create_trigger$
      CREATE EVENT TRIGGER ensure_rls
      ON ddl_command_end
      WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      EXECUTE FUNCTION public.rls_auto_enable()
    $create_trigger$;
  END IF;
END
$bootstrap_trigger$;

DO $validate_trigger$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_event_trigger AS e
    WHERE e.evtname = 'ensure_rls'
      AND e.evtevent = 'ddl_command_end'
      AND e.evtenabled = 'O'
      AND e.evtfoid = to_regprocedure('public.rls_auto_enable()')
      AND e.evttags = ARRAY['CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO']::text[]
  ) THEN
    RAISE EXCEPTION
      'event trigger ensure_rls exists but is incompatible with the expected production definition; refusing to overwrite it';
  END IF;
END
$validate_trigger$;

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role;
