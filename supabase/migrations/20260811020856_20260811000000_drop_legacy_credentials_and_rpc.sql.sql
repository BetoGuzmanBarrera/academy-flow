-- Migration 2: Drop legacy plaintext credential columns and create_pending_order RPC
-- Precondition: exactly 1 legacy row with plaintext data, belonging to order bc7905ff...
-- That row has NO encrypted_payload/encryption_iv. The other 2 rows are fully encrypted.

-- A. Delete ONLY the legacy credential row for order bc7905ff-b247-47dc-a2aa-ef832854d41b
--    FK credential_access_log_credential_id_fkey has ON DELETE SET NULL → audit preserved
DELETE FROM public.order_credentials
WHERE order_id = 'bc7905ff-b247-47dc-a2aa-ef832854d41b'
  AND encrypted_payload IS NULL
  AND encryption_iv IS NULL
  AND (
    coalesce(platform_email, '') <> ''
    OR coalesce(platform_password, '') <> ''
    OR coalesce(aleks_account, '') <> ''
    OR coalesce(additional_info, '') <> ''
  );

-- B. Verify no plaintext legacy data remains (will fail the migration if any row still has data)
DO $$
DECLARE
  legacy_count integer;
BEGIN
  SELECT count(*) INTO legacy_count
  FROM public.order_credentials
  WHERE coalesce(platform_email, '') <> ''
     OR coalesce(platform_password, '') <> ''
     OR coalesce(aleks_account, '') <> ''
     OR coalesce(additional_info, '') <> '';
  IF legacy_count > 0 THEN
    RAISE EXCEPTION 'Legacy plaintext data still present in % rows', legacy_count;
  END IF;
END $$;

-- C. Drop legacy plaintext columns from order_credentials
ALTER TABLE public.order_credentials
  DROP COLUMN IF EXISTS platform_email,
  DROP COLUMN IF EXISTS platform_password,
  DROP COLUMN IF EXISTS aleks_account,
  DROP COLUMN IF EXISTS additional_info;

-- D. Drop legacy function create_pending_order(text, text, jsonb, jsonb)
DROP FUNCTION IF EXISTS public.create_pending_order(text, text, jsonb, jsonb);