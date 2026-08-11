/*
# Revoke EXECUTE from PUBLIC on Secure Functions

Postgres grants EXECUTE on functions to PUBLIC by default when they are
created. REVOKE FROM anon, authenticated is insufficient because PUBLIC
is a separate grant. This migration revokes from PUBLIC directly.
*/

REVOKE EXECUTE ON FUNCTION public.transition_order_secure(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_order_secure(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reopen_order_secure(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_order_secure(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_order_transition(uuid, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_orders_updated_at() FROM PUBLIC;