/*
  # Secure support message submission

  - Routes all new messages through the send-support-message Edge Function by
    removing direct INSERT access from browser roles.
  - Enforces length limits on new messages and direct edits to message fields
    without blocking Admin updates to historical rows.
  - Adds a durable, atomic rate limiter reachable only by service_role.
  - Leaves existing SELECT policies and the Admin UPDATE flow unchanged.
*/

BEGIN;

DROP POLICY IF EXISTS "Guests can create support messages"
  ON public.support_messages;
DROP POLICY IF EXISTS "Users can create own support messages"
  ON public.support_messages;
DROP POLICY IF EXISTS "Anyone can create support messages"
  ON public.support_messages;

REVOKE INSERT ON public.support_messages FROM anon, authenticated;
REVOKE INSERT (user_id, user_email, user_name, message, created_at, updated_at)
  ON public.support_messages FROM anon, authenticated;
GRANT INSERT ON public.support_messages TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_support_message_input_limits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.user_name IS NULL
    OR char_length(btrim(NEW.user_name)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'support_messages_user_name_length_check',
      MESSAGE = 'support message name must be between 1 and 100 characters';
  END IF;

  IF NEW.user_email IS NULL
    OR char_length(btrim(NEW.user_email)) NOT BETWEEN 3 AND 320 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'support_messages_user_email_length_check',
      MESSAGE = 'support message email must be between 3 and 320 characters';
  END IF;

  IF NEW.message IS NULL
    OR char_length(btrim(NEW.message)) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'support_messages_message_length_check',
      MESSAGE = 'support message must be between 1 and 4000 characters';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_support_message_input_limits() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_support_message_input_limits
  ON public.support_messages;
CREATE TRIGGER enforce_support_message_input_limits
  BEFORE INSERT OR UPDATE OF user_name, user_email, message
  ON public.support_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_support_message_input_limits();

CREATE TABLE IF NOT EXISTS public.support_message_rate_limits (
  actor_hash text PRIMARY KEY
    CHECK (actor_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 1
    CHECK (request_count > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_message_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_message_rate_limits FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.support_message_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.support_message_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.check_support_message_rate_limit(
  p_actor_hash text,
  p_max_requests integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_window_started_at timestamptz;
  v_request_count integer;
  v_now timestamptz := now();
BEGIN
  IF p_actor_hash IS NULL
    OR p_actor_hash !~ '^[0-9a-f]{64}$'
    OR p_max_requests < 1
    OR p_max_requests > 100
    OR p_window_seconds < 1
    OR p_window_seconds > 86400 THEN
    RETURN false;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_hash, 0));

  SELECT window_started_at, request_count
    INTO v_window_started_at, v_request_count
  FROM public.support_message_rate_limits
  WHERE actor_hash = p_actor_hash;

  IF NOT FOUND
    OR v_window_started_at <= v_now - make_interval(secs => p_window_seconds) THEN
    INSERT INTO public.support_message_rate_limits (
      actor_hash,
      window_started_at,
      request_count,
      updated_at
    )
    VALUES (p_actor_hash, v_now, 1, v_now)
    ON CONFLICT (actor_hash) DO UPDATE
      SET window_started_at = EXCLUDED.window_started_at,
          request_count = 1,
          updated_at = EXCLUDED.updated_at;
    RETURN true;
  END IF;

  IF v_request_count >= p_max_requests THEN
    RETURN false;
  END IF;

  UPDATE public.support_message_rate_limits
  SET request_count = request_count + 1,
      updated_at = v_now
  WHERE actor_hash = p_actor_hash;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_support_message_rate_limit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_support_message_rate_limit(text, integer, integer)
  TO service_role;

COMMIT;
