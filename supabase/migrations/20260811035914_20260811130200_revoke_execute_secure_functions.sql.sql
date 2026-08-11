/*
# Revoke EXECUTE on Secure Functions

CREATE OR REPLACE FUNCTION re-grants EXECUTE to PUBLIC by default.
This migration re-revokes EXECUTE from anon and authenticated on all
SECURITY DEFINER functions that should only be callable from edge
functions using the service_role key.
*/

REVOKE EXECUTE ON FUNCTION public.transition_order_secure(uuid, uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_order_secure(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reopen_order_secure(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_order_secure(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_order_transition(uuid, text, text, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_orders_updated_at() FROM anon, authenticated;