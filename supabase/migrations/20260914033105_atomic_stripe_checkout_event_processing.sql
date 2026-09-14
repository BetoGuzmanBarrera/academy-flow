-- Atomically claim a Stripe Checkout event and confirm its order payment.
-- Any exception from mark_order_paid_secure rolls back the event claim, allowing
-- Stripe to retry the delivery safely.
CREATE OR REPLACE FUNCTION public.process_stripe_checkout_event_secure(
  p_event_id            text,
  p_event_type          text,
  p_order_id            uuid,
  p_payment_id          text,
  p_checkout_session_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claimed_rows bigint;
BEGIN
  IF p_event_id IS NULL OR btrim(p_event_id) = '' THEN
    RAISE EXCEPTION 'Event ID is required';
  END IF;
  IF p_event_type IS NULL OR btrim(p_event_type) = '' THEN
    RAISE EXCEPTION 'Event type is required';
  END IF;
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Order ID is required';
  END IF;
  IF p_payment_id IS NULL OR btrim(p_payment_id) = '' THEN
    RAISE EXCEPTION 'Payment ID is required';
  END IF;
  IF p_checkout_session_id IS NULL OR btrim(p_checkout_session_id) = '' THEN
    RAISE EXCEPTION 'Checkout session ID is required';
  END IF;

  INSERT INTO public.stripe_webhook_events (
    event_id,
    event_type
  )
  VALUES (
    p_event_id,
    p_event_type
  )
  ON CONFLICT (event_id) DO NOTHING;

  GET DIAGNOSTICS v_claimed_rows = ROW_COUNT;

  IF v_claimed_rows = 0 THEN
    RETURN 'duplicate';
  END IF;

  PERFORM public.mark_order_paid_secure(
    p_order_id,
    p_payment_id,
    p_checkout_session_id
  );

  RETURN 'processed';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_stripe_checkout_event_secure(text, text, uuid, text, text)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_stripe_checkout_event_secure(text, text, uuid, text, text)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_stripe_checkout_event_secure(text, text, uuid, text, text)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_stripe_checkout_event_secure(text, text, uuid, text, text)
  TO service_role;
