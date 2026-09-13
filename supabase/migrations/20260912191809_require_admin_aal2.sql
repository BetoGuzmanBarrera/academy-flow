-- Require a verified second factor only on existing administrative RLS paths.
-- Owner, normal-user, and public policies remain unchanged.

ALTER POLICY "Admins can manage profiles"
  ON public.profiles
  USING (
    (SELECT public.is_admin())
    AND COALESCE((SELECT auth.jwt()) ->> 'aal', '') = 'aal2'
  )
  WITH CHECK (
    (SELECT public.is_admin())
    AND COALESCE((SELECT auth.jwt()) ->> 'aal', '') = 'aal2'
  );

ALTER POLICY "Admins can view activity log"
  ON public.admin_activity_log
  USING (
    (SELECT public.is_admin())
    AND COALESCE((SELECT auth.jwt()) ->> 'aal', '') = 'aal2'
  );

ALTER POLICY "Admins can create activity log"
  ON public.admin_activity_log
  WITH CHECK (
    (SELECT public.is_admin())
    AND COALESCE((SELECT auth.jwt()) ->> 'aal', '') = 'aal2'
    AND admin_id = (SELECT auth.uid())
  );

ALTER POLICY "Admins can manage categories"
  ON public.categories
  USING (
    (SELECT public.is_admin())
    AND COALESCE((SELECT auth.jwt()) ->> 'aal', '') = 'aal2'
  )
  WITH CHECK (
    (SELECT public.is_admin())
    AND COALESCE((SELECT auth.jwt()) ->> 'aal', '') = 'aal2'
  );

ALTER POLICY "Admins can manage services"
  ON public.services
  USING (
    (SELECT public.is_admin())
    AND COALESCE((SELECT auth.jwt()) ->> 'aal', '') = 'aal2'
  )
  WITH CHECK (
    (SELECT public.is_admin())
    AND COALESCE((SELECT auth.jwt()) ->> 'aal', '') = 'aal2'
  );

ALTER POLICY "Admins can view orders"
  ON public.orders
  USING (
    (SELECT public.is_admin())
    AND COALESCE((SELECT auth.jwt()) ->> 'aal', '') = 'aal2'
  );

ALTER POLICY "Admins can view order items"
  ON public.order_items
  USING (
    (SELECT public.is_admin())
    AND COALESCE((SELECT auth.jwt()) ->> 'aal', '') = 'aal2'
  );

ALTER POLICY "Admins can manage support messages"
  ON public.support_messages
  USING (
    (SELECT public.is_admin())
    AND COALESCE((SELECT auth.jwt()) ->> 'aal', '') = 'aal2'
  )
  WITH CHECK (
    (SELECT public.is_admin())
    AND COALESCE((SELECT auth.jwt()) ->> 'aal', '') = 'aal2'
  );

ALTER POLICY "Admins can manage referral codes"
  ON public.referral_codes
  USING (
    (SELECT public.is_admin())
    AND COALESCE((SELECT auth.jwt()) ->> 'aal', '') = 'aal2'
  )
  WITH CHECK (
    (SELECT public.is_admin())
    AND COALESCE((SELECT auth.jwt()) ->> 'aal', '') = 'aal2'
  );

ALTER POLICY "Admins can manage referral uses"
  ON public.referral_uses
  USING (
    (SELECT public.is_admin())
    AND COALESCE((SELECT auth.jwt()) ->> 'aal', '') = 'aal2'
  )
  WITH CHECK (
    (SELECT public.is_admin())
    AND COALESCE((SELECT auth.jwt()) ->> 'aal', '') = 'aal2'
  );

ALTER POLICY "Admins can manage billing information"
  ON public.billing_information
  USING (
    (SELECT public.is_admin())
    AND COALESCE((SELECT auth.jwt()) ->> 'aal', '') = 'aal2'
  )
  WITH CHECK (
    (SELECT public.is_admin())
    AND COALESCE((SELECT auth.jwt()) ->> 'aal', '') = 'aal2'
  );

ALTER POLICY "Admins can read all order history"
  ON public.order_status_history
  USING (
    (SELECT public.is_admin())
    AND COALESCE((SELECT auth.jwt()) ->> 'aal', '') = 'aal2'
  );

ALTER POLICY "admins_read_credential_access_log"
  ON public.credential_access_log
  USING (
    (SELECT public.is_admin())
    AND COALESCE((SELECT auth.jwt()) ->> 'aal', '') = 'aal2'
  );
