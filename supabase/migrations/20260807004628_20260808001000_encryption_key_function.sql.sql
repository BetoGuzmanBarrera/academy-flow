-- ============================================================
-- Function to retrieve the encryption key from vault
-- Only service_role can execute it
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_encryption_key()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'credential_encryption_key_v1'
  LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.get_encryption_key()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_encryption_key()
  TO service_role;
