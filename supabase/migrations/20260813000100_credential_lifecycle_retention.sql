/*
# Future-safe credential lifecycle retention

Installs lifecycle rules for future credential inserts and future order state
changes. This migration intentionally contains no data backfill, so existing
order_credentials rows are not modified when it is applied.
*/

-- Give credentials inserted for a pending, unpaid order a 24-hour lifetime.
CREATE OR REPLACE FUNCTION public.set_pending_credential_expiration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_order_status text;
  v_payment_status text;
BEGIN
  SELECT status, payment_status
  INTO v_order_status, v_payment_status
  FROM public.orders
  WHERE id = NEW.order_id
  FOR SHARE;

  IF v_order_status = 'pending'
     AND v_payment_status = 'pending'
     AND NEW.deleted_at IS NULL THEN
    NEW.expires_at := COALESCE(NEW.created_at, now()) + interval '24 hours';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.set_pending_credential_expiration()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS set_pending_credential_expiration_on_insert
  ON public.order_credentials;

CREATE TRIGGER set_pending_credential_expiration_on_insert
  BEFORE INSERT ON public.order_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.set_pending_credential_expiration();

-- Preserve the existing state machine while adding lifecycle side effects for
-- pending -> in_progress and cancellation.
CREATE OR REPLACE FUNCTION public.transition_order_secure(
  p_order_id uuid,
  p_admin_id uuid,
  p_new_status text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_current_status text;
  v_payment_status text;
  v_order_exists boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_admin_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT status, payment_status
  INTO v_current_status, v_payment_status
  FROM public.orders
  WHERE id = p_order_id
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La orden no existe';
  END IF;

  IF NOT (
    (v_current_status = 'pending' AND p_new_status = 'in_progress')
    OR (v_current_status = 'pending' AND p_new_status = 'cancelled')
    OR (v_current_status = 'in_progress' AND p_new_status = 'completed')
    OR (v_current_status = 'in_progress' AND p_new_status = 'cancelled')
    OR (v_current_status = 'completed' AND p_new_status = 'in_progress')
  ) THEN
    RAISE EXCEPTION 'Transicion no permitida: % -> %', v_current_status, p_new_status;
  END IF;

  IF p_new_status = 'completed' AND v_payment_status != 'paid' THEN
    RAISE EXCEPTION 'La orden no puede completarse sin pago confirmado';
  END IF;

  IF p_new_status = 'completed' THEN
    UPDATE public.orders
    SET status = 'completed', completed_at = now()
    WHERE id = p_order_id;

    UPDATE public.order_credentials
    SET expires_at = now() + interval '7 days',
        updated_at = now()
    WHERE order_id = p_order_id AND deleted_at IS NULL;

    INSERT INTO public.credential_access_log (
      credential_id, order_id, accessed_by,
      action, success, reason_code, request_id
    )
    SELECT id, p_order_id, p_admin_id,
      'retention_scheduled', true, 'order_completed', NULL
    FROM public.order_credentials
    WHERE order_id = p_order_id AND deleted_at IS NULL;

  ELSIF p_new_status = 'in_progress' AND v_current_status = 'completed' THEN
    UPDATE public.orders
    SET status = 'in_progress', completed_at = NULL
    WHERE id = p_order_id;

    UPDATE public.order_credentials
    SET expires_at = NULL, updated_at = now()
    WHERE order_id = p_order_id AND deleted_at IS NULL AND expires_at IS NOT NULL;

    INSERT INTO public.credential_access_log (
      credential_id, order_id, accessed_by,
      action, success, reason_code, request_id
    )
    SELECT id, p_order_id, p_admin_id,
      'reopened', true, 'order_reopened', NULL
    FROM public.order_credentials
    WHERE order_id = p_order_id AND deleted_at IS NULL;

  ELSIF p_new_status = 'in_progress' AND v_current_status = 'pending' THEN
    PERFORM credential.id
    FROM public.order_credentials AS credential
    WHERE credential.order_id = p_order_id
    ORDER BY credential.id
    FOR UPDATE;

    IF EXISTS (
      SELECT 1
      FROM public.order_credentials AS credential
      WHERE credential.order_id = p_order_id
        AND (
          credential.deleted_at IS NOT NULL
          OR credential.encrypted_payload IS NULL
          OR credential.encryption_iv IS NULL
          OR (
            credential.expires_at IS NOT NULL
            AND credential.expires_at <= now()
          )
        )
    ) THEN
      RAISE EXCEPTION 'Las credenciales de la orden ya no estan disponibles; deben volver a proporcionarse';
    END IF;

    UPDATE public.orders
    SET status = 'in_progress'
    WHERE id = p_order_id;

    UPDATE public.order_credentials
    SET expires_at = NULL, updated_at = now()
    WHERE order_id = p_order_id
      AND deleted_at IS NULL
      AND expires_at IS NOT NULL;

  ELSIF p_new_status = 'cancelled' THEN
    UPDATE public.orders
    SET status = 'cancelled', cancelled_at = now()
    WHERE id = p_order_id;

    WITH destroyed AS (
      UPDATE public.order_credentials
      SET encrypted_payload = NULL,
          encryption_iv = NULL,
          deleted_at = COALESCE(deleted_at, now()),
          updated_at = now()
      WHERE order_id = p_order_id
        AND (
          deleted_at IS NULL
          OR encrypted_payload IS NOT NULL
          OR encryption_iv IS NOT NULL
        )
      RETURNING id, order_id
    )
    INSERT INTO public.credential_access_log (
      credential_id, order_id, accessed_by,
      action, success, reason_code, request_id
    )
    SELECT id, order_id, p_admin_id,
      'order_cancelled', true, 'order_cancelled', NULL
    FROM destroyed;
  END IF;

  PERFORM public.log_order_transition(p_order_id, v_current_status, p_new_status, p_admin_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.transition_order_secure(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

-- Destroy active credential material when an order is newly marked refunded.
CREATE OR REPLACE FUNCTION public.destroy_refunded_order_credentials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  WITH destroyed AS (
    UPDATE public.order_credentials
    SET encrypted_payload = NULL,
        encryption_iv = NULL,
        deleted_at = COALESCE(deleted_at, now()),
        updated_at = now()
    WHERE order_id = NEW.id
      AND (
        deleted_at IS NULL
        OR encrypted_payload IS NOT NULL
        OR encryption_iv IS NOT NULL
      )
    RETURNING id, order_id
  )
  INSERT INTO public.credential_access_log (
    credential_id, order_id, accessed_by,
    action, success, reason_code, request_id
  )
  SELECT id, order_id, NULL,
    'deleted', true, 'order_refunded', NULL
  FROM destroyed;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.destroy_refunded_order_credentials()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS destroy_order_credentials_on_refund
  ON public.orders;

CREATE TRIGGER destroy_order_credentials_on_refund
  AFTER UPDATE OF payment_status ON public.orders
  FOR EACH ROW
  WHEN (
    OLD.payment_status IS DISTINCT FROM NEW.payment_status
    AND NEW.payment_status = 'refunded'
  )
  EXECUTE FUNCTION public.destroy_refunded_order_credentials();
