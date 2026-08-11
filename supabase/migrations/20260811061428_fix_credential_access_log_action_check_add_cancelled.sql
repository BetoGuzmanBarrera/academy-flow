-- The transition_order_secure function inserts action = 'order_cancelled'
-- into credential_access_log when an order is cancelled, but the
-- existing CHECK constraint did not include that value, causing
-- SQLSTATE 23514 (check_violation) and blocking all cancellations.

ALTER TABLE public.credential_access_log
  DROP CONSTRAINT credential_access_log_action_check;

ALTER TABLE public.credential_access_log
  ADD CONSTRAINT credential_access_log_action_check
  CHECK (action = ANY (ARRAY[
    'encrypted'::text,
    'revealed'::text,
    'reveal_denied'::text,
    'retention_scheduled'::text,
    'reopened'::text,
    'deleted'::text,
    'expired'::text,
    'rotated'::text,
    'order_cancelled'::text
  ]));