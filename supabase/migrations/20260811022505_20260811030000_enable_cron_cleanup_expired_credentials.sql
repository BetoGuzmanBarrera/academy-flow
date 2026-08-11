/*
# Automated Credential Cleanup with pg_cron

## Purpose
Schedules an automatic hourly job that runs `public.cleanup_expired_credentials()`
to purge expired credentials (nullify encrypted_payload and encryption_iv,
set deleted_at) without any manual intervention.

## Changes
1. Enable the `pg_cron` extension (if not already enabled) in the `extensions`
   schema, following Supabase's recommended approach.
2. Create a single named cron job `academy_flow_expired_credentials_cleanup`
   that executes `SELECT public.cleanup_expired_credentials();` every hour
   (at minute 0 of every hour).
3. The job creation is idempotent: if a job with the same name already exists,
   it is unscheduled first and then rescheduled to avoid duplicates.

## Security
- No HTTP, no pg_net, no secrets, no service_role key used.
- EXECUTE on `cleanup_expired_credentials()` remains restricted to
  `service_role` and `postgres` only — PUBLIC, anon, and authenticated
  are NOT granted EXECUTE.
- RLS on all credential tables is unchanged.
- The cron job runs with database superuser privileges (pg_cron's default),
  which already has EXECUTE on the SECURITY DEFINER function.
*/

-- 1. Enable pg_cron extension (Supabase-recommended schema)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- 2. Idempotently create exactly one cron job
DO $do$
BEGIN
  -- Unschedule any existing job with the same name to avoid duplicates
  BEGIN
    PERFORM cron.unschedule('academy_flow_expired_credentials_cleanup');
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  -- Schedule the job: every hour at minute 0
  -- Try cron.schedule first (default pg_cron schema), fall back to extensions
  BEGIN
    PERFORM cron.schedule(
      'academy_flow_expired_credentials_cleanup',
      '0 * * * *',
      $cmd$SELECT public.cleanup_expired_credentials();$cmd$
    );
  EXCEPTION
    WHEN undefined_function THEN
      PERFORM extensions.schedule(
        'academy_flow_expired_credentials_cleanup',
        '0 * * * *',
        $cmd$SELECT public.cleanup_expired_credentials();$cmd$
      );
  END;
END
$do$;

-- 3. Re-confirm EXECUTE is NOT granted to PUBLIC, anon, or authenticated
--    (cleanup_expired_credentials is SECURITY DEFINER, service_role only)
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_credentials()
  FROM PUBLIC, anon, authenticated;
