REVOKE ALL PRIVILEGES
ON TABLE public.stripe_webhook_events
FROM anon, authenticated;

REVOKE DELETE, UPDATE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.stripe_webhook_events
FROM service_role;

GRANT SELECT, INSERT
ON TABLE public.stripe_webhook_events
TO service_role;
