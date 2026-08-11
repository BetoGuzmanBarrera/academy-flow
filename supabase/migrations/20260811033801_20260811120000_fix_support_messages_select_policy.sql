/*
# Fix support_messages SELECT policy that references auth.users

## Problem
The SELECT policy "Users can view messages without user_id if they match email"
contains a subquery: `(SELECT users.email FROM auth.users WHERE users.id = auth.uid())`.
The `authenticated` role does NOT have SELECT privilege on `auth.users`, so this
subquery raises a permission error. PostgREST evaluates ALL permissive SELECT
policies on a table, so even though the "Admins can manage support messages"
(FOR ALL) policy would allow admins through, the broken email-match policy
errors out and causes the entire SELECT to fail for every authenticated user —
including admins. This is why the Admin panel shows "No se pudieron cargar: mensajes".

## Fix
Replace the `auth.users` subquery with `auth.jwt() ->> 'email'`, which reads
the email from the JWT claims without needing table access. The semantics are
identical: a signed-in user can view guest messages (user_id IS NULL) where
the message's user_email matches their own email.

## Security
- No new privileges granted. No `USING (true)`. No broadening of access.
- Admins keep full access via the existing "Admins can manage support messages"
  FOR ALL policy (is_admin()).
- Normal users can still only read their own messages (by user_id) or guest
  messages matching their email — nothing changes for them.
- RLS stays enabled. No policy is weakened.
*/

DROP POLICY IF EXISTS "Users can view messages without user_id if they match email"
  ON public.support_messages;

CREATE POLICY "Users can view messages without user_id if they match email"
  ON public.support_messages FOR SELECT
  TO authenticated
  USING (
    user_id IS NULL
    AND user_email = (auth.jwt() ->> 'email')
  );