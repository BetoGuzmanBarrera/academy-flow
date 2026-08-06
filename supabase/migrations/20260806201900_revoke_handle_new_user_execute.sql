/*
  # Remove client EXECUTE on the signup trigger function

  public.handle_new_user() is a SECURITY DEFINER trigger function that writes to
  public.profiles. It runs as part of the on_auth_user_created trigger and never
  needs to be callable from the Data API, so EXECUTE is revoked from PUBLIC,
  anon and authenticated.
*/

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;
