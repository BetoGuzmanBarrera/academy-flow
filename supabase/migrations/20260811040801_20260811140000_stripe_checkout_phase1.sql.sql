/*
# Stripe Checkout Phase 1 — Schema & Secure Payment RPC

## Purpose
Prepare the database for Stripe Checkout (test mode) integration. Adds a column
to link orders to Stripe Checkout Sessions, creates a webhook idempotency table,
and a SECURITY DEFINER RPC that marks an order as paid — callable only by the
service_role.

## 1. New columns on `orders`
- `stripe_checkout_session_id` (text, nullable) — stores the Stripe Checkout
  Session ID (`cs_test_...`) created for this order.

## 2. Constraints & indexes on `orders`
- UNIQUE index on `payment_id` WHERE NOT NULL — prevents two orders from sharing
  the same Stripe Payment Intent ID.
- UNIQUE index on `stripe_checkout_session_id` WHERE NOT NULL — prevents two
  orders from sharing the same Checkout Session.

## 3. New table `stripe_webhook_events`
- `event_id` (text, PRIMARY KEY) — the Stripe event ID (`evt_...`).
- `event_type` (text, NOT NULL) — e.g. `checkout.session.completed`.
- `processed_at` (timestamptz, NOT NULL, default now()).
- RLS enabled. No policies — anon/authenticated have no SELECT/INSERT/UPDATE/DELETE.
  Only the service_role (which bypasses RLS) can write, and only from edge functions.

## 4. New function `mark_order_paid_secure`
- SECURITY DEFINER, search_path = ''.
- EXECUTE granted ONLY to `service_role`; revoked from PUBLIC, anon, authenticated.
- Idempotent: if the order is already `paid` with the same payment_id and
  checkout_session_id, returns success without side effects.
- Rejects conflict if a different payment_id is already stored.
- Sets `payment_status='paid'`, `payment_id`, `stripe_checkout_session_id`,
  `paid_at=now()`.
- Does NOT change `orders.status` (the admin workflow stays unchanged).
- Does NOT touch credentials.

## Security
- No VITE_ secrets. No frontend-exposed keys.
- The RPC is callable only by the service_role key, which never leaves the server.
- `stripe_webhook_events` is locked behind RLS with no policies.
*/

-- 1. Column on orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;

-- 2. Unique partial indexes
CREATE UNIQUE INDEX IF NOT EXISTS orders_payment_id_unique
  ON public.orders (payment_id)
  WHERE payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_checkout_session_id_unique
  ON public.orders (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- 3. stripe_webhook_events table
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id      text        PRIMARY KEY,
  event_type    text        NOT NULL,
  processed_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- No policies: anon and authenticated get nothing. Only service_role bypasses RLS.

-- 4. mark_order_paid_secure RPC
CREATE OR REPLACE FUNCTION public.mark_order_paid_secure(
  p_order_id            uuid,
  p_payment_id          text,
  p_checkout_session_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_payment_status text;
  v_current_payment_id      text;
  v_current_session_id      text;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Order ID is required';
  END IF;
  IF p_payment_id IS NULL OR btrim(p_payment_id) = '' THEN
    RAISE EXCEPTION 'Payment ID is required';
  END IF;
  IF p_checkout_session_id IS NULL OR btrim(p_checkout_session_id) = '' THEN
    RAISE EXCEPTION 'Checkout session ID is required';
  END IF;

  SELECT payment_status, payment_id, stripe_checkout_session_id
    INTO v_current_payment_status, v_current_payment_id, v_current_session_id
    FROM public.orders
    WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Idempotent: already paid with same IDs, success, no-op
  IF v_current_payment_status = 'paid'
     AND v_current_payment_id = p_payment_id
     AND COALESCE(v_current_session_id, '') = p_checkout_session_id THEN
    RETURN;
  END IF;

  -- Conflict: already paid with a different payment_id
  IF v_current_payment_status = 'paid' AND v_current_payment_id <> p_payment_id THEN
    RAISE EXCEPTION 'Order already paid with a different payment ID';
  END IF;

  -- Conflict: already paid with a different session
  IF v_current_payment_status = 'paid'
     AND COALESCE(v_current_session_id, '') <> ''
     AND COALESCE(v_current_session_id, '') <> p_checkout_session_id THEN
    RAISE EXCEPTION 'Order already paid with a different checkout session';
  END IF;

  -- Only allow transitioning from pending or failed
  IF v_current_payment_status NOT IN ('pending', 'failed') THEN
    RAISE EXCEPTION 'Order payment status is %, cannot mark as paid', v_current_payment_status;
  END IF;

  UPDATE public.orders
    SET payment_status             = 'paid',
        payment_id                 = p_payment_id,
        stripe_checkout_session_id = p_checkout_session_id,
        paid_at                    = now(),
        updated_at                 = now()
    WHERE id = p_order_id;
END;
$$;

-- Revoke all access from non-service roles
REVOKE EXECUTE ON FUNCTION public.mark_order_paid_secure(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_order_paid_secure(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_order_paid_secure(uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_paid_secure(uuid, text, text) TO service_role;
