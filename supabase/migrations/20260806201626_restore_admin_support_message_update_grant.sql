/*
  # Restore the column privileges the admin support panel needs

  The previous migration revoked UPDATE on support_messages from authenticated,
  which also removed it from admins (admins use the authenticated role).
  Re-grant UPDATE only on the reply columns. Row access stays gated by the
  existing "Admins can manage support messages" policy, and no policy allows a
  non-admin to UPDATE this table, so the grant is not reachable by customers.
*/

GRANT UPDATE (admin_response, status, updated_at)
  ON public.support_messages TO authenticated;
