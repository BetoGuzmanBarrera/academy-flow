-- A private, short-lived proof that one code was recently validated by this user.
CREATE TABLE public.referral_validation_receipts (
  user_id uuid NOT NULL,
  normalized_code text NOT NULL,
  referral_code_id uuid NOT NULL,
  referral_owner_id uuid NOT NULL,
  validated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_order_id uuid,
  PRIMARY KEY (user_id, normalized_code),
  CONSTRAINT referral_receipt_expiry_check CHECK (expires_at > validated_at),
  CONSTRAINT referral_receipt_consumption_check
    CHECK ((consumed_at IS NULL) = (consumed_order_id IS NULL))
);

ALTER TABLE public.referral_validation_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.referral_validation_receipts
  FROM PUBLIC, anon, authenticated, service_role;

-- A failed order transaction must not undo a counted validation attempt.
-- Both public validation and server-side preparation call this in their own
-- successful transaction before create_secure_order begins.
CREATE FUNCTION public.consume_referral_validation_attempt_secure(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_attempt_count integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO public.referral_validation_rate_limits AS limits
    (user_id, window_started_at, attempt_count)
  VALUES (p_user_id, v_now, 1)
  ON CONFLICT (user_id) DO UPDATE
  SET window_started_at = CASE
        WHEN limits.window_started_at <= EXCLUDED.window_started_at - interval '10 minutes'
          THEN EXCLUDED.window_started_at
        ELSE limits.window_started_at
      END,
      attempt_count = CASE
        WHEN limits.window_started_at <= EXCLUDED.window_started_at - interval '10 minutes'
          THEN 1
        ELSE limits.attempt_count + 1
      END
  RETURNING attempt_count INTO v_attempt_count;

  IF v_attempt_count > 20 THEN
    RAISE EXCEPTION 'Referral code validation rate limit exceeded';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.consume_referral_validation_attempt_secure(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_referral_validation_attempt_secure(uuid)
  TO service_role;

-- Preserve the browser RPC contract. Every explicit check costs one attempt.
CREATE OR REPLACE FUNCTION public.validate_referral_code(code_param text)
RETURNS TABLE (valid boolean, self_use boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_code text := upper(trim(coalesce(code_param, '')));
  v_referral_id uuid;
  v_owner_id uuid;
  v_now timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  PERFORM public.consume_referral_validation_attempt_secure(v_user_id);

  SELECT code.id, code.user_id INTO v_referral_id, v_owner_id
  FROM public.referral_codes AS code
  WHERE code.code = v_code;

  IF v_referral_id IS NOT NULL AND v_owner_id <> v_user_id THEN
    v_now := clock_timestamp();
    INSERT INTO public.referral_validation_receipts AS receipt
      (user_id, normalized_code, referral_code_id, referral_owner_id,
       validated_at, expires_at, consumed_at, consumed_order_id)
    VALUES (v_user_id, v_code, v_referral_id, v_owner_id,
            v_now, v_now + interval '10 minutes', NULL, NULL)
    ON CONFLICT (user_id, normalized_code) DO UPDATE
    SET referral_code_id = EXCLUDED.referral_code_id,
        referral_owner_id = EXCLUDED.referral_owner_id,
        validated_at = EXCLUDED.validated_at,
        expires_at = EXCLUDED.expires_at,
        consumed_at = NULL,
        consumed_order_id = NULL;
  END IF;

  RETURN QUERY SELECT v_referral_id IS NOT NULL,
    coalesce(v_owner_id = v_user_id, false);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.validate_referral_code(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_referral_code(text)
  TO authenticated, service_role;

-- Called by create-secure-order after verifying the JWT. A current receipt
-- avoids charging the user twice for the code just validated in checkout.
CREATE FUNCTION public.prepare_referral_code_secure(p_user_id uuid, p_code text)
RETURNS TABLE (valid boolean, self_use boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_code text := upper(trim(coalesce(p_code, '')));
  v_referral_id uuid;
  v_owner_id uuid;
  v_now timestamptz;
  v_receipt public.referral_validation_receipts%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_receipt
  FROM public.referral_validation_receipts AS receipt
  WHERE receipt.user_id = p_user_id AND receipt.normalized_code = v_code
    AND receipt.consumed_at IS NULL
    AND receipt.expires_at > clock_timestamp();

  IF FOUND THEN
    SELECT code.id, code.user_id INTO v_referral_id, v_owner_id
    FROM public.referral_codes AS code
    WHERE code.code = v_code;
    IF v_referral_id = v_receipt.referral_code_id
       AND v_owner_id = v_receipt.referral_owner_id
       AND v_owner_id <> p_user_id THEN
      RETURN QUERY SELECT true, false;
      RETURN;
    END IF;
  END IF;

  PERFORM public.consume_referral_validation_attempt_secure(p_user_id);

  -- An uncached or stale code lookup is charged to the same 20/10m limiter.
  SELECT code.id, code.user_id INTO v_referral_id, v_owner_id
  FROM public.referral_codes AS code
  WHERE code.code = v_code;

  IF v_referral_id IS NOT NULL AND v_owner_id <> p_user_id THEN
    v_now := clock_timestamp();
    INSERT INTO public.referral_validation_receipts AS receipt
      (user_id, normalized_code, referral_code_id, referral_owner_id,
       validated_at, expires_at, consumed_at, consumed_order_id)
    VALUES (p_user_id, v_code, v_referral_id, v_owner_id,
            v_now, v_now + interval '10 minutes', NULL, NULL)
    ON CONFLICT (user_id, normalized_code) DO UPDATE
    SET referral_code_id = EXCLUDED.referral_code_id,
        referral_owner_id = EXCLUDED.referral_owner_id,
        validated_at = EXCLUDED.validated_at,
        expires_at = EXCLUDED.expires_at,
        consumed_at = NULL,
        consumed_order_id = NULL;
  END IF;

  RETURN QUERY SELECT v_referral_id IS NOT NULL,
    coalesce(v_owner_id = p_user_id, false);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.prepare_referral_code_secure(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_referral_code_secure(uuid, text)
  TO service_role;

-- Keep the existing validated order implementation intact and inaccessible to
-- Data API roles. The public signature below is the only callable entry point.
CREATE SCHEMA IF NOT EXISTS academy_internal;
REVOKE ALL ON SCHEMA academy_internal FROM PUBLIC, anon, authenticated, service_role;
ALTER FUNCTION public.create_secure_order(uuid, uuid, text, text, jsonb, jsonb)
  RENAME TO create_secure_order_unchecked;
ALTER FUNCTION public.create_secure_order_unchecked(uuid, uuid, text, text, jsonb, jsonb)
  SET SCHEMA academy_internal;
REVOKE EXECUTE ON FUNCTION academy_internal.create_secure_order_unchecked(uuid, uuid, text, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.create_secure_order(
  p_order_id uuid,
  p_user_id uuid,
  p_payment_method text,
  p_referral_code text DEFAULT NULL,
  p_encrypted_credentials jsonb DEFAULT '[]'::jsonb,
  p_billing jsonb DEFAULT NULL
)
RETURNS TABLE(order_id uuid, total_amount numeric, discount_amount numeric)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_code text := nullif(upper(trim(coalesce(p_referral_code, ''))), '');
  v_referral_id uuid;
  v_owner_id uuid;
BEGIN
  IF v_code IS NOT NULL THEN
    -- Match the current referral row and lock it through order creation.
    SELECT code.id, code.user_id INTO v_referral_id, v_owner_id
    FROM public.referral_codes AS code
    WHERE code.code = v_code
    FOR SHARE;

    IF v_referral_id IS NULL OR v_owner_id = p_user_id THEN
      RAISE EXCEPTION 'Referral validation required';
    END IF;

    PERFORM 1 FROM public.referral_validation_receipts AS receipt
    WHERE receipt.user_id = p_user_id
      AND receipt.normalized_code = v_code
      AND receipt.referral_code_id = v_referral_id
      AND receipt.referral_owner_id = v_owner_id
      AND receipt.consumed_at IS NULL
      AND receipt.expires_at > clock_timestamp()
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referral validation required';
    END IF;
  END IF;

  RETURN QUERY SELECT * FROM academy_internal.create_secure_order_unchecked(
    p_order_id, p_user_id, p_payment_method, v_code,
    p_encrypted_credentials, p_billing
  );

  IF v_code IS NOT NULL THEN
    UPDATE public.referral_validation_receipts
    SET consumed_at = clock_timestamp(), consumed_order_id = p_order_id
    WHERE user_id = p_user_id
      AND normalized_code = v_code
      AND referral_code_id = v_referral_id
      AND referral_owner_id = v_owner_id
      AND consumed_at IS NULL
      AND expires_at > clock_timestamp();

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referral validation required';
    END IF;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_secure_order(uuid, uuid, text, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_secure_order(uuid, uuid, text, text, jsonb, jsonb)
  TO service_role;
