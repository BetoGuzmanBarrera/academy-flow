CREATE TABLE public.referral_validation_rate_limits (
  user_id           uuid PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  attempt_count     integer NOT NULL,
  CONSTRAINT referral_validation_rate_limits_attempt_count_check
    CHECK (attempt_count >= 0)
);

ALTER TABLE public.referral_validation_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES
ON TABLE public.referral_validation_rate_limits
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.validate_referral_code(code_param text)
RETURNS TABLE (
  valid boolean,
  self_use boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id       uuid;
  v_now           timestamptz;
  v_attempt_count integer;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_now := now();

  INSERT INTO public.referral_validation_rate_limits AS limits (
    user_id,
    window_started_at,
    attempt_count
  )
  VALUES (
    v_user_id,
    v_now,
    1
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    window_started_at = CASE
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

  RETURN QUERY
  SELECT
    EXISTS (
      SELECT 1
      FROM public.referral_codes
      WHERE code = upper(trim(code_param))
    ) AS valid,
    EXISTS (
      SELECT 1
      FROM public.referral_codes
      WHERE code = upper(trim(code_param))
        AND user_id = v_user_id
    ) AS self_use;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_referral_code(text)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_referral_code(text)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_referral_code(text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_referral_code(text)
  TO service_role;
