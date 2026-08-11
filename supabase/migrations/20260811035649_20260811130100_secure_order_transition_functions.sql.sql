/*
# Secure Order Transition Functions

## Purpose
Replace the existing complete_order_secure and reopen_order_secure with
a unified, validated state machine. Add cancel_order_secure and
transition_order_secure. All functions enforce:
- Admin authorization (role = 'admin' in profiles)
- Valid state transitions (no invalid jumps)
- payment_status = 'paid' requirement for completion
- Credential side-effects (expires_at on complete, cleared on reopen)
- Audit logging to order_status_history and credential_access_log
- Timestamp management (completed_at, cancelled_at)

## Functions
1. transition_order_secure(p_order_id, p_admin_id, p_new_status)
   - Unified entry point for all transitions
   - Validates: admin role, current status, transition validity
   - For 'completed': requires payment_status = 'paid'
   - Delegates to specific logic for each target status
2. complete_order_secure(p_order_id, p_admin_id) — kept for compatibility
3. reopen_order_secure(p_order_id, p_admin_id) — kept for compatibility
4. cancel_order_secure(p_order_id, p_admin_id) — new

## Valid Transitions
- pending -> in_progress
- pending -> cancelled
- in_progress -> completed (requires payment_status = 'paid')
- in_progress -> cancelled
- completed -> in_progress (reopen)

## Security
- All functions are SECURITY DEFINER with search_path = ''
- They bypass RLS to update orders (which is now blocked for clients)
- They insert into order_status_history (which has no client INSERT grant)
- p_admin_id is verified against profiles.role = 'admin'
*/

-- ============================================================
-- Helper: log status transition
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_order_transition(
  p_order_id uuid,
  p_from_status text,
  p_to_status text,
  p_changed_by uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by)
  VALUES (p_order_id, p_from_status, p_to_status, p_changed_by);
END;
$function$;

-- ============================================================
-- Main: transition_order_secure
-- ============================================================
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
  -- Verify admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_admin_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Get current state
  SELECT status, payment_status INTO v_current_status, v_payment_status
  FROM public.orders WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La orden no existe';
  END IF;

  -- Validate transition
  IF NOT (
    (v_current_status = 'pending' AND p_new_status = 'in_progress')
    OR (v_current_status = 'pending' AND p_new_status = 'cancelled')
    OR (v_current_status = 'in_progress' AND p_new_status = 'completed')
    OR (v_current_status = 'in_progress' AND p_new_status = 'cancelled')
    OR (v_current_status = 'completed' AND p_new_status = 'in_progress')
  ) THEN
    RAISE EXCEPTION 'Transicion no permitida: % -> %', v_current_status, p_new_status;
  END IF;

  -- Completion requires payment_status = 'paid'
  IF p_new_status = 'completed' AND v_payment_status != 'paid' THEN
    RAISE EXCEPTION 'La orden no puede completarse sin pago confirmado';
  END IF;

  -- Execute transition
  IF p_new_status = 'completed' THEN
    UPDATE public.orders
    SET status = 'completed', completed_at = now()
    WHERE id = p_order_id;

    -- Set credential expiration
    UPDATE public.order_credentials
    SET expires_at = now() + interval '7 days',
        updated_at = now()
    WHERE order_id = p_order_id AND deleted_at IS NULL;

    -- Audit credential retention
    INSERT INTO public.credential_access_log (
      credential_id, order_id, accessed_by,
      action, success, reason_code, request_id
    )
    SELECT id, p_order_id, p_admin_id,
      'retention_scheduled', true, 'order_completed', NULL
    FROM public.order_credentials
    WHERE order_id = p_order_id AND deleted_at IS NULL;

  ELSIF p_new_status = 'in_progress' AND v_current_status = 'completed' THEN
    -- Reopen: completed -> in_progress
    UPDATE public.orders
    SET status = 'in_progress', completed_at = NULL
    WHERE id = p_order_id;

    -- Clear credential expiration
    UPDATE public.order_credentials
    SET expires_at = NULL, updated_at = now()
    WHERE order_id = p_order_id AND deleted_at IS NULL AND expires_at IS NOT NULL;

    -- Audit reopen
    INSERT INTO public.credential_access_log (
      credential_id, order_id, accessed_by,
      action, success, reason_code, request_id
    )
    SELECT id, p_order_id, p_admin_id,
      'reopened', true, 'order_reopened', NULL
    FROM public.order_credentials
    WHERE order_id = p_order_id AND deleted_at IS NULL;

  ELSIF p_new_status = 'in_progress' AND v_current_status = 'pending' THEN
    -- pending -> in_progress
    UPDATE public.orders
    SET status = 'in_progress'
    WHERE id = p_order_id;

  ELSIF p_new_status = 'cancelled' THEN
    -- Cancel (from pending or in_progress)
    UPDATE public.orders
    SET status = 'cancelled', cancelled_at = now()
    WHERE id = p_order_id;

    -- Audit cancel in credential_access_log
    INSERT INTO public.credential_access_log (
      credential_id, order_id, accessed_by,
      action, success, reason_code, request_id
    )
    SELECT id, p_order_id, p_admin_id,
      'order_cancelled', true, 'order_cancelled', NULL
    FROM public.order_credentials
    WHERE order_id = p_order_id AND deleted_at IS NULL;
  END IF;

  -- Log the transition
  PERFORM public.log_order_transition(p_order_id, v_current_status, p_new_status, p_admin_id);
END;
$function$;

-- ============================================================
-- Compatibility wrappers (delegate to transition_order_secure)
-- ============================================================

CREATE OR REPLACE FUNCTION public.complete_order_secure(
  p_order_id uuid,
  p_admin_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  PERFORM public.transition_order_secure(p_order_id, p_admin_id, 'completed');
END;
$function$;

CREATE OR REPLACE FUNCTION public.reopen_order_secure(
  p_order_id uuid,
  p_admin_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  PERFORM public.transition_order_secure(p_order_id, p_admin_id, 'in_progress');
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_order_secure(
  p_order_id uuid,
  p_admin_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  PERFORM public.transition_order_secure(p_order_id, p_admin_id, 'cancelled');
END;
$function$;

-- ============================================================
-- Revoke EXECUTE from anon and authenticated
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.transition_order_secure(uuid, uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_order_secure(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reopen_order_secure(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_order_secure(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_order_transition(uuid, text, text, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_orders_updated_at() FROM anon, authenticated;