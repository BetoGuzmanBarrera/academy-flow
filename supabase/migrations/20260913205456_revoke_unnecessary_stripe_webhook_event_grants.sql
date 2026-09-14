REVOKE ALL PRIVILEGES
ON TABLE public.stripe_webhook_events
FROM anon, authenticated, service_role;

GRANT SELECT, INSERT
ON TABLE public.stripe_webhook_events
TO service_role;
