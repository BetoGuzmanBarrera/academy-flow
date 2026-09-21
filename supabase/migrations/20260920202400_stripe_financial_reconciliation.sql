-- Persist a Checkout creation request before contacting Stripe. Cancellation
-- can then find even a session whose creation response was lost.
CREATE TABLE public.stripe_checkout_reconciliation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  user_id uuid NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  previous_session_id text,
  checkout_session_id text UNIQUE,
  expected_amount integer NOT NULL CHECK (expected_amount > 0),
  currency text NOT NULL DEFAULT 'mxn' CHECK (currency = 'mxn'),
  site_url text NOT NULL,
  state text NOT NULL DEFAULT 'creating'
    CHECK (state IN ('creating', 'open', 'reconcile', 'done', 'manual_review')),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stripe_checkout_reconciliation_due_idx
  ON public.stripe_checkout_reconciliation (next_attempt_at)
  WHERE state IN ('creating', 'reconcile');
ALTER TABLE public.stripe_checkout_reconciliation ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.stripe_checkout_reconciliation
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.stripe_checkout_reconciliation
  TO service_role;

CREATE TABLE public.stripe_refund_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  checkout_session_id text NOT NULL,
  payment_intent_id text NOT NULL UNIQUE,
  expected_amount integer NOT NULL CHECK (expected_amount > 0),
  currency text NOT NULL DEFAULT 'mxn' CHECK (currency = 'mxn'),
  purpose text NOT NULL DEFAULT 'cancelled_order_refund'
    CHECK (purpose IN ('cancelled_order_refund', 'duplicate_payment_refund')),
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'confirmed', 'manual_review')),
  confirmed_refund_id text UNIQUE,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stripe_refund_obligations_due_idx
  ON public.stripe_refund_obligations (next_attempt_at)
  WHERE state = 'pending';
ALTER TABLE public.stripe_refund_obligations ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.stripe_refund_obligations
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.stripe_refund_obligations
  TO service_role;

CREATE TABLE public.stripe_refund_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id uuid NOT NULL REFERENCES public.stripe_refund_obligations(id),
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  amount integer NOT NULL CHECK (amount > 0),
  idempotency_key text NOT NULL UNIQUE,
  stripe_refund_id text UNIQUE,
  state text NOT NULL DEFAULT 'prepared'
    CHECK (state IN ('prepared', 'ambiguous', 'pending', 'succeeded', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obligation_id, attempt_number)
);
ALTER TABLE public.stripe_refund_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.stripe_refund_attempts
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.stripe_refund_attempts
  TO service_role;

CREATE SCHEMA IF NOT EXISTS academy_internal;
REVOKE ALL ON SCHEMA academy_internal FROM PUBLIC, anon, authenticated, service_role;

-- Called only while the order row is locked. Both refund and session work must
-- be durable before a cancelled order can become financially refunded.
CREATE FUNCTION academy_internal.maybe_finalize_cancelled_order_refund_secure(
  p_order_id uuid
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.orders
  WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status <> 'cancelled'
     OR v_order.payment_status = 'refunded' THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stripe_refund_obligations
    WHERE order_id = p_order_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.stripe_refund_obligations
    WHERE order_id = p_order_id AND state IS DISTINCT FROM 'confirmed'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.stripe_checkout_reconciliation
    WHERE order_id = p_order_id AND state IS DISTINCT FROM 'done'
  ) THEN
    UPDATE public.orders
    SET payment_status = 'refunded', refunded_at = now(), updated_at = now()
    WHERE id = p_order_id AND status = 'cancelled';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION academy_internal.maybe_finalize_cancelled_order_refund_secure(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- The order row is the serialization point shared with cancellation and
-- webhook confirmation. No Stripe request occurs while holding this lock.
CREATE FUNCTION public.reserve_stripe_checkout_session_secure(
  p_order_id uuid, p_user_id uuid, p_previous_session_id text,
  p_amount integer, p_site_url text
) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_key text;
  v_existing public.stripe_checkout_reconciliation%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.orders
  WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.user_id IS DISTINCT FROM p_user_id
     OR v_order.status = 'cancelled'
     OR v_order.payment_status NOT IN ('pending', 'failed')
     OR v_order.stripe_checkout_session_id IS DISTINCT FROM p_previous_session_id
     OR round(v_order.total_amount * 100)::integer <> p_amount
     OR p_site_url !~ '^https://' THEN
    RAISE EXCEPTION 'Checkout reservation is no longer valid';
  END IF;

  v_key := 'checkout-session:' || p_order_id::text || ':' ||
    coalesce(p_previous_session_id, 'initial');
  INSERT INTO public.stripe_checkout_reconciliation
    (order_id, user_id, idempotency_key, previous_session_id,
     expected_amount, site_url)
  VALUES (p_order_id, p_user_id, v_key, p_previous_session_id,
          p_amount, p_site_url)
  ON CONFLICT (idempotency_key) DO NOTHING;

  SELECT * INTO v_existing FROM public.stripe_checkout_reconciliation
  WHERE idempotency_key = v_key FOR UPDATE;
  IF v_existing.order_id IS DISTINCT FROM p_order_id
     OR v_existing.user_id IS DISTINCT FROM p_user_id
     OR v_existing.expected_amount IS DISTINCT FROM p_amount
     OR v_existing.site_url IS DISTINCT FROM p_site_url
     OR v_existing.state = 'manual_review' THEN
    RAISE EXCEPTION 'Checkout reservation conflict';
  END IF;
  RETURN v_key;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reserve_stripe_checkout_session_secure(uuid, uuid, text, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reserve_stripe_checkout_session_secure(uuid, uuid, text, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reserve_stripe_checkout_session_secure(uuid, uuid, text, integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_stripe_checkout_session_secure(uuid, uuid, text, integer, text) TO service_role;

CREATE FUNCTION public.record_stripe_checkout_session_secure(
  p_order_id uuid, p_user_id uuid, p_key text, p_session_id text
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_reservation public.stripe_checkout_reconciliation%ROWTYPE;
  v_allowed boolean;
BEGIN
  IF p_session_id IS NULL OR btrim(p_session_id) = '' THEN
    RAISE EXCEPTION 'Checkout session ID is required';
  END IF;
  SELECT * INTO v_order FROM public.orders
  WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  SELECT * INTO v_reservation FROM public.stripe_checkout_reconciliation
  WHERE idempotency_key = p_key AND order_id = p_order_id FOR UPDATE;
  IF NOT FOUND OR (v_reservation.checkout_session_id IS NOT NULL
      AND v_reservation.checkout_session_id <> p_session_id) THEN
    RAISE EXCEPTION 'Checkout reservation conflict';
  END IF;

  v_allowed := v_order.status <> 'cancelled'
    AND v_order.payment_status IN ('pending', 'failed')
    AND (v_order.stripe_checkout_session_id IS NOT DISTINCT FROM
         v_reservation.previous_session_id
         OR v_order.stripe_checkout_session_id = p_session_id);

  IF EXISTS (
    SELECT 1 FROM public.stripe_checkout_reconciliation
    WHERE checkout_session_id = p_session_id AND id <> v_reservation.id
  ) THEN
    -- The signed webhook or cancellation already recorded this session.
    -- Keep its durable row and do not issue the Checkout URL.
    UPDATE public.stripe_checkout_reconciliation
    SET state = 'done', updated_at = now()
    WHERE id = v_reservation.id;
    PERFORM academy_internal.maybe_finalize_cancelled_order_refund_secure(p_order_id);
    RETURN false;
  END IF;

  UPDATE public.stripe_checkout_reconciliation
  SET checkout_session_id = p_session_id,
      state = CASE WHEN v_allowed THEN 'open' ELSE 'reconcile' END,
      next_attempt_at = now(), updated_at = now()
  WHERE id = v_reservation.id;

  IF v_allowed THEN
    UPDATE public.orders
    SET stripe_checkout_session_id = p_session_id, updated_at = now()
    WHERE id = p_order_id;
  END IF;
  RETURN v_allowed;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_stripe_checkout_session_secure(uuid, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_stripe_checkout_session_secure(uuid, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_stripe_checkout_session_secure(uuid, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_stripe_checkout_session_secure(uuid, uuid, text, text) TO service_role;

CREATE FUNCTION public.can_reuse_stripe_checkout_session_secure(
  p_order_id uuid, p_user_id uuid, p_session_id text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_allowed boolean;
BEGIN
  SELECT true INTO v_allowed FROM public.orders
  WHERE id = p_order_id AND user_id = p_user_id
    AND status <> 'cancelled' AND payment_status IN ('pending', 'failed')
    AND stripe_checkout_session_id = p_session_id;
  RETURN coalesce(v_allowed, false);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.can_reuse_stripe_checkout_session_secure(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_reuse_stripe_checkout_session_secure(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_reuse_stripe_checkout_session_secure(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.can_reuse_stripe_checkout_session_secure(uuid, uuid, text) TO service_role;

-- If a paid order is cancelled, refund work is committed with the order and
-- credential-destruction changes. Unknown sessions are inspected by the worker.
CREATE FUNCTION public.queue_cancelled_stripe_order_secure()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.stripe_checkout_reconciliation
  SET state = 'reconcile', next_attempt_at = now(), updated_at = now()
  WHERE order_id = NEW.id AND state IN ('creating', 'open');

  IF NEW.stripe_checkout_session_id IS NOT NULL THEN
    INSERT INTO public.stripe_checkout_reconciliation
      (order_id, user_id, idempotency_key, checkout_session_id,
       expected_amount, site_url, state)
    VALUES (NEW.id, NEW.user_id,
      'legacy-session:' || NEW.stripe_checkout_session_id,
      NEW.stripe_checkout_session_id,
      round(NEW.total_amount * 100)::integer, '', 'reconcile')
    ON CONFLICT (checkout_session_id) DO UPDATE
    SET state = 'reconcile', next_attempt_at = now(), updated_at = now();
  END IF;

  IF NEW.payment_status = 'paid' AND NEW.payment_id IS NOT NULL THEN
    INSERT INTO public.stripe_refund_obligations
      (order_id, checkout_session_id, payment_intent_id, expected_amount)
    VALUES (NEW.id, coalesce(NEW.stripe_checkout_session_id, ''),
      NEW.payment_id, round(NEW.total_amount * 100)::integer)
    ON CONFLICT (payment_intent_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER queue_stripe_reconciliation_on_cancel
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'cancelled')
  EXECUTE FUNCTION public.queue_cancelled_stripe_order_secure();

REVOKE EXECUTE ON FUNCTION public.queue_cancelled_stripe_order_secure()
  FROM PUBLIC, anon, authenticated, service_role;

-- Repeated admin cancellation is a no-op after authorization. The original
-- transition implementation and credential lifecycle remain unchanged.
ALTER FUNCTION public.transition_order_secure(uuid, uuid, text)
  RENAME TO transition_order_secure_original;
ALTER FUNCTION public.transition_order_secure_original(uuid, uuid, text)
  SET SCHEMA academy_internal;
REVOKE EXECUTE ON FUNCTION academy_internal.transition_order_secure_original(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.transition_order_secure(
  p_order_id uuid, p_admin_id uuid, p_new_status text
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_admin_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT status INTO v_status FROM public.orders
  WHERE id = p_order_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La orden no existe';
  END IF;
  IF v_status = 'cancelled' AND p_new_status = 'cancelled' THEN
    RETURN;
  END IF;

  PERFORM academy_internal.transition_order_secure_original(
    p_order_id, p_admin_id, p_new_status
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.transition_order_secure(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_order_secure(uuid, uuid, text)
  TO service_role;

-- Direct callers may not mark a cancelled order paid. The signed webhook
-- uses the event RPC below to record a refund obligation instead.
CREATE OR REPLACE FUNCTION public.mark_order_paid_secure(
  p_order_id uuid, p_payment_id text, p_checkout_session_id text
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  IF p_order_id IS NULL OR nullif(btrim(p_payment_id), '') IS NULL
     OR nullif(btrim(p_checkout_session_id), '') IS NULL THEN
    RAISE EXCEPTION 'Payment identifiers are required';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  IF v_order.payment_status = 'paid'
     AND v_order.payment_id = p_payment_id
     AND v_order.stripe_checkout_session_id = p_checkout_session_id THEN
    RETURN;
  END IF;
  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cancelled order cannot be marked paid';
  END IF;
  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'Order already paid with different payment identifiers';
  END IF;
  IF v_order.payment_status NOT IN ('pending', 'failed') THEN
    RAISE EXCEPTION 'Order payment status is %, cannot mark as paid',
      v_order.payment_status;
  END IF;
  UPDATE public.orders
  SET payment_status = 'paid', payment_id = p_payment_id,
      stripe_checkout_session_id = p_checkout_session_id,
      paid_at = now(), updated_at = now()
  WHERE id = p_order_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mark_order_paid_secure(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_paid_secure(uuid, text, text)
  TO service_role;

-- The event claim, order lock, and refund obligation share one transaction.
CREATE FUNCTION public.process_stripe_checkout_event_secure(
  p_event_id text, p_event_type text, p_order_id uuid,
  p_payment_id text, p_checkout_session_id text, p_reservation_key text
) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_claimed integer;
  v_new_obligation integer;
BEGIN
  IF nullif(btrim(p_event_id), '') IS NULL
     OR p_event_type NOT IN
       ('checkout.session.completed', 'checkout.session.async_payment_succeeded')
     OR p_order_id IS NULL
     OR nullif(btrim(p_payment_id), '') IS NULL
     OR nullif(btrim(p_checkout_session_id), '') IS NULL THEN
    RAISE EXCEPTION 'Invalid Stripe event identifiers';
  END IF;

  SELECT * INTO v_order FROM public.orders
  WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  INSERT INTO public.stripe_webhook_events (event_id, event_type)
  VALUES (p_event_id, p_event_type)
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed = 0 THEN RETURN 'duplicate'; END IF;

  IF p_reservation_key IS NOT NULL THEN
    UPDATE public.stripe_checkout_reconciliation
    SET state = 'done', updated_at = now()
    WHERE order_id = p_order_id
      AND idempotency_key = p_reservation_key
      AND (checkout_session_id IS NULL
           OR checkout_session_id = p_checkout_session_id);
  END IF;

  IF v_order.status = 'cancelled'
     OR (v_order.payment_status = 'paid'
         AND v_order.payment_id IS DISTINCT FROM p_payment_id)
     OR v_order.payment_status = 'refunded' THEN
    INSERT INTO public.stripe_refund_obligations
      (order_id, checkout_session_id, payment_intent_id, expected_amount,
       purpose)
    VALUES (p_order_id, p_checkout_session_id, p_payment_id,
      round(v_order.total_amount * 100)::integer,
      CASE WHEN v_order.status = 'cancelled'
        THEN 'cancelled_order_refund' ELSE 'duplicate_payment_refund' END)
    ON CONFLICT (payment_intent_id) DO NOTHING;
    GET DIAGNOSTICS v_new_obligation = ROW_COUNT;

    IF v_order.payment_status = 'refunded' AND v_new_obligation = 1 THEN
      UPDATE public.orders
      SET payment_status = 'paid', refunded_at = NULL, updated_at = now()
      WHERE id = p_order_id;
    END IF;

    INSERT INTO public.stripe_checkout_reconciliation
      (order_id, user_id, idempotency_key, checkout_session_id,
       expected_amount, site_url, state)
    VALUES (p_order_id, v_order.user_id,
      'webhook-session:' || p_checkout_session_id, p_checkout_session_id,
      round(v_order.total_amount * 100)::integer, '', 'done')
    ON CONFLICT (checkout_session_id) DO UPDATE
    SET state = 'done', updated_at = now();
    PERFORM academy_internal.maybe_finalize_cancelled_order_refund_secure(p_order_id);
    RETURN 'refund_queued';
  END IF;

  PERFORM public.mark_order_paid_secure(
    p_order_id, p_payment_id, p_checkout_session_id
  );
  UPDATE public.stripe_checkout_reconciliation
  SET state = 'done', updated_at = now()
  WHERE checkout_session_id = p_checkout_session_id;
  PERFORM academy_internal.maybe_finalize_cancelled_order_refund_secure(p_order_id);
  RETURN 'processed';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.process_stripe_checkout_event_secure(text, text, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_stripe_checkout_event_secure(text, text, uuid, text, text, text)
  TO service_role;

-- Compatible with the previously deployed webhook during staged rollout.
-- It delegates to the same guarded implementation and cannot bypass it.
CREATE OR REPLACE FUNCTION public.process_stripe_checkout_event_secure(
  p_event_id text, p_event_type text, p_order_id uuid,
  p_payment_id text, p_checkout_session_id text
) RETURNS text
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public.process_stripe_checkout_event_secure(
    p_event_id, p_event_type, p_order_id, p_payment_id,
    p_checkout_session_id, NULL::text
  );
$$;
REVOKE EXECUTE ON FUNCTION public.process_stripe_checkout_event_secure(text, text, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_stripe_checkout_event_secure(text, text, uuid, text, text)
  TO service_role;

-- Claims are short transactions. External Stripe calls happen after return.
CREATE FUNCTION public.claim_stripe_session_reconciliation_secure()
RETURNS SETOF public.stripe_checkout_reconciliation
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.stripe_checkout_reconciliation AS job
  SET lease_token = gen_random_uuid(),
      lease_until = now() + interval '2 minutes',
      attempt_count = job.attempt_count + 1,
      updated_at = now()
  WHERE job.id = (
    SELECT candidate.id FROM public.stripe_checkout_reconciliation AS candidate
    JOIN public.orders AS o ON o.id = candidate.order_id
    WHERE candidate.state IN ('creating', 'reconcile')
      AND o.status = 'cancelled'
      AND candidate.next_attempt_at <= now()
      AND (candidate.lease_until IS NULL OR candidate.lease_until < now())
    ORDER BY candidate.next_attempt_at, candidate.id
    FOR UPDATE OF candidate SKIP LOCKED LIMIT 1
  )
  RETURNING job.*;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_stripe_session_reconciliation_secure()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_session_reconciliation_secure()
  TO service_role;

-- Complete the leased session and re-evaluate refund finalization atomically.
-- Stripe calls have already finished before this RPC begins.
CREATE FUNCTION public.complete_stripe_session_reconciliation_secure(
  p_job_id uuid, p_lease_token uuid, p_session_id text
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_order_id uuid;
  v_job public.stripe_checkout_reconciliation%ROWTYPE;
  v_recorded_id uuid;
  v_recorded_order_id uuid;
BEGIN
  IF nullif(btrim(p_session_id), '') IS NULL OR p_lease_token IS NULL THEN
    RAISE EXCEPTION 'Invalid session completion';
  END IF;

  SELECT order_id INTO v_order_id
  FROM public.stripe_checkout_reconciliation WHERE id = p_job_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session reconciliation not found'; END IF;
  PERFORM 1 FROM public.orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  SELECT * INTO v_job FROM public.stripe_checkout_reconciliation
  WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.order_id IS DISTINCT FROM v_order_id
     OR v_job.lease_token IS DISTINCT FROM p_lease_token
     OR v_job.state NOT IN ('creating', 'reconcile')
     OR (v_job.checkout_session_id IS NOT NULL
         AND v_job.checkout_session_id <> p_session_id) THEN
    RAISE EXCEPTION 'Session reconciliation lease is no longer valid';
  END IF;

  SELECT id, order_id INTO v_recorded_id, v_recorded_order_id
  FROM public.stripe_checkout_reconciliation
  WHERE checkout_session_id = p_session_id;
  IF v_recorded_id IS NOT NULL
     AND v_recorded_order_id IS DISTINCT FROM v_order_id THEN
    RAISE EXCEPTION 'Checkout session belongs to another order';
  END IF;
  UPDATE public.stripe_checkout_reconciliation
  SET checkout_session_id = CASE
        WHEN v_recorded_id IS NULL OR v_recorded_id = p_job_id
          THEN p_session_id ELSE checkout_session_id END,
      state = 'done', last_error = NULL,
      lease_token = NULL, lease_until = NULL, updated_at = now()
  WHERE id = p_job_id;

  PERFORM academy_internal.maybe_finalize_cancelled_order_refund_secure(v_order_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.complete_stripe_session_reconciliation_secure(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_stripe_session_reconciliation_secure(uuid, uuid, text)
  TO service_role;

CREATE FUNCTION public.claim_stripe_refund_reconciliation_secure()
RETURNS SETOF public.stripe_refund_obligations
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.stripe_refund_obligations AS job
  SET lease_token = gen_random_uuid(),
      lease_until = now() + interval '2 minutes',
      attempt_count = job.attempt_count + 1,
      updated_at = now()
  WHERE job.id = (
    SELECT candidate.id FROM public.stripe_refund_obligations AS candidate
    WHERE candidate.state = 'pending'
      AND candidate.next_attempt_at <= now()
      AND (candidate.lease_until IS NULL OR candidate.lease_until < now())
    ORDER BY candidate.next_attempt_at, candidate.id
    FOR UPDATE SKIP LOCKED LIMIT 1
  )
  RETURNING job.*;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_stripe_refund_reconciliation_secure()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_refund_reconciliation_secure()
  TO service_role;

-- Used by the reconciler when a Checkout Session is found paid without a
-- corresponding webhook delivery. The order lock prevents a paid/cancel race.
CREATE FUNCTION public.queue_stripe_refund_secure(
  p_order_id uuid, p_checkout_session_id text, p_payment_id text,
  p_amount integer, p_currency text
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_new_obligation integer;
  v_existing public.stripe_refund_obligations%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.orders
  WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status <> 'cancelled'
     OR p_currency <> 'mxn'
     OR p_amount IS DISTINCT FROM round(v_order.total_amount * 100)::integer
     OR nullif(btrim(p_checkout_session_id), '') IS NULL
     OR nullif(btrim(p_payment_id), '') IS NULL THEN
    RAISE EXCEPTION 'Invalid cancelled-order payment';
  END IF;

  INSERT INTO public.stripe_refund_obligations
    (order_id, checkout_session_id, payment_intent_id, expected_amount)
  VALUES (p_order_id, p_checkout_session_id, p_payment_id, p_amount)
  ON CONFLICT (payment_intent_id) DO NOTHING;
  GET DIAGNOSTICS v_new_obligation = ROW_COUNT;

  IF v_new_obligation = 0 THEN
    SELECT * INTO v_existing FROM public.stripe_refund_obligations
    WHERE payment_intent_id = p_payment_id;
    IF NOT FOUND OR v_existing.order_id IS DISTINCT FROM p_order_id
       OR v_existing.checkout_session_id IS DISTINCT FROM p_checkout_session_id
       OR v_existing.expected_amount IS DISTINCT FROM p_amount
       OR v_existing.currency IS DISTINCT FROM p_currency
       OR v_existing.purpose <> 'cancelled_order_refund' THEN
      RAISE EXCEPTION 'Refund obligation conflict';
    END IF;
  END IF;

  IF v_order.payment_status = 'refunded' AND v_new_obligation = 1 THEN
    UPDATE public.orders
    SET payment_status = 'paid', refunded_at = NULL, updated_at = now()
    WHERE id = p_order_id;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.queue_stripe_refund_secure(uuid, text, text, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_stripe_refund_secure(uuid, text, text, integer, text)
  TO service_role;

-- Only a confirmed full refund for every known payment may finalize the
-- cancelled order. A late second PaymentIntent creates new pending work.
CREATE FUNCTION public.confirm_stripe_refund_secure(
  p_obligation_id uuid, p_refund_id text
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_order_id uuid;
  v_status text;
  v_purpose text;
BEGIN
  SELECT order_id, purpose INTO v_order_id, v_purpose
  FROM public.stripe_refund_obligations
  WHERE id = p_obligation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refund obligation not found'; END IF;

  SELECT status INTO v_status FROM public.orders
  WHERE id = v_order_id FOR UPDATE;
  IF v_status <> 'cancelled' AND v_purpose <> 'duplicate_payment_refund' THEN
    RAISE EXCEPTION 'Order is not cancelled';
  END IF;

  UPDATE public.stripe_refund_obligations
  SET state = 'confirmed', confirmed_refund_id = p_refund_id,
      lease_token = NULL, lease_until = NULL, updated_at = now()
  WHERE id = p_obligation_id;

  PERFORM academy_internal.maybe_finalize_cancelled_order_refund_secure(v_order_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.confirm_stripe_refund_secure(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_stripe_refund_secure(uuid, text)
  TO service_role;
