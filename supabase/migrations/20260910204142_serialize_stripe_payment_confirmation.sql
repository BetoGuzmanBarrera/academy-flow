-- Serialize Stripe payment confirmation for each order so concurrent webhook
-- deliveries cannot overwrite an already confirmed payment or Checkout Session.
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
    WHERE id = p_order_id
    FOR UPDATE;

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

REVOKE EXECUTE ON FUNCTION public.mark_order_paid_secure(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_order_paid_secure(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_order_paid_secure(uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_paid_secure(uuid, text, text) TO service_role;
