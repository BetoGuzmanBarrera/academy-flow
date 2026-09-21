-- Invokes the protected worker every minute. Both Vault entries must be
-- provisioned during the staged deployment; without them this job makes no
-- HTTP request and retains pending work for later recovery.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.schedule(
  'academy_flow_stripe_reconciliation',
  '* * * * *',
  $job$
  SELECT net.http_post(
    url := secrets.project_url || '/functions/v1/reconcile-stripe-payments',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Reconciler-Token', secrets.worker_token
    ),
    body := '{}'::jsonb
  )
  FROM (
    SELECT
      (SELECT decrypted_secret FROM vault.decrypted_secrets
       WHERE name = 'academy_flow_stripe_reconciler_url') AS project_url,
      (SELECT decrypted_secret FROM vault.decrypted_secrets
       WHERE name = 'academy_flow_stripe_reconciler_token') AS worker_token
  ) AS secrets
  WHERE secrets.project_url ~ '^https://[^/]+[.]supabase[.]co$'
    AND length(secrets.worker_token) >= 32;
  $job$
);
