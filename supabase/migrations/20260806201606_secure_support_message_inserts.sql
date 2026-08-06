/*
  # Bind support message inserts to the caller

  1. Replaces the permissive "Anyone can create support messages" INSERT policy
     (TO public, WITH CHECK true) with two scoped policies:
     - guests (anon) may only create rows with user_id NULL
     - signed-in users may only create rows for their own user_id
  2. Both policies forbid setting admin_response or a non-default status, so an
     outsider cannot forge a support-team reply shown inside a customer's chat.
  3. Removes INSERT/UPDATE privileges on the admin_response and status columns
     from anon and authenticated; those columns are managed by admins only.
*/

DROP POLICY IF EXISTS "Anyone can create support messages" ON public.support_messages;

CREATE POLICY "Guests can create support messages"
  ON public.support_messages FOR INSERT
  TO anon
  WITH CHECK (
    user_id IS NULL
    AND admin_response IS NULL
    AND status = 'pending'
  );

CREATE POLICY "Users can create own support messages"
  ON public.support_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND admin_response IS NULL
    AND status = 'pending'
  );

REVOKE INSERT, UPDATE ON public.support_messages FROM anon, authenticated;

GRANT INSERT (user_id, user_email, user_name, message, created_at, updated_at)
  ON public.support_messages TO anon, authenticated;
