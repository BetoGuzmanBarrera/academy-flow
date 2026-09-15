-- Keep payment confirmation and the fulfillment transition serialized on the
-- same order row. Only pending -> in_progress requires a confirmed payment;
-- reopening a completed order preserves the existing lifecycle behavior.
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

  IF v_current_status = 'pending'
     AND p_new_status = 'in_progress'
     AND v_payment_status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'Order must be paid before processing';
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

GRANT EXECUTE ON FUNCTION public.transition_order_secure(uuid, uuid, text)
  TO service_role;
