-- ============================================================
-- Drop get_encryption_key() function
--
-- The encryption key is now accessed exclusively via
-- Deno.env.get('CREDENTIALS_ENCRYPTION_KEY_V1') inside edge
-- functions. PostgreSQL no longer needs to return the master
-- key, so this SECURITY DEFINER function is no longer needed.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_encryption_key();
