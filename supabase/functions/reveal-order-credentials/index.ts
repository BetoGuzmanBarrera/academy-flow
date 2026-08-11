import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCredentialAAD } from '../_shared/aad.ts';
import { byteaToUint8Array } from '../_shared/bytea.ts';
import { getCorsHeaders, handleOptions } from '../_shared/cors.ts';

const KEY_VERSION = 1;

function jsonError(message: string, status = 400, origin: string | null = null): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) },
  });
}

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyHex = Deno.env.get('CREDENTIALS_ENCRYPTION_KEY_V1')?.trim();
  if (!keyHex || keyHex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error('Encryption key not configured');
  }
  const keyBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    keyBytes[i] = parseInt(keyHex.substring(i * 2, i * 2 + 2), 16);
  }
  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleOptions(req);

  const origin = req.headers.get('Origin');

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonError('Unauthorized', 401, origin);
    }
    const jwt = authHeader.substring(7);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return jsonError('Unauthorized', 401, origin);
    }
    const adminId = userData.user.id;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', adminId)
      .single();

    if (!profile || profile.role !== 'admin') {
      await adminClient.from('credential_access_log').insert({
        credential_id: null,
        order_id: null,
        accessed_by: adminId,
        requested_credential_id: null,
        action: 'reveal_denied',
        success: false,
        reason_code: 'not_admin',
        request_id: crypto.randomUUID(),
      });
      return jsonError('Forbidden', 403, origin);
    }

    const body = await req.json();
    const credentialId = body?.credentialId;
    if (!credentialId || typeof credentialId !== 'string') {
      return jsonError('credentialId is required', 400, origin);
    }

    const requestId = crypto.randomUUID();

    const { data: allowed, error: rateError } = await adminClient.rpc('check_reveal_rate_limit', {
      p_admin_id: adminId,
      p_request_id: requestId,
    });

    if (rateError || !allowed) {
      await adminClient.from('credential_access_log').insert({
        credential_id: null,
        order_id: null,
        accessed_by: adminId,
        requested_credential_id: credentialId,
        action: 'reveal_denied',
        success: false,
        reason_code: 'rate_limited',
        request_id: requestId,
      });
      return jsonError('Too many requests', 429, origin);
    }

    const { data: cred, error: credError } = await adminClient
      .from('order_credentials')
      .select('id, order_id, service_id, encrypted_payload, encryption_iv, key_version, deleted_at, expires_at')
      .eq('id', credentialId)
      .single();

    if (credError || !cred) {
      await adminClient.from('credential_access_log').insert({
        credential_id: null,
        order_id: null,
        accessed_by: adminId,
        requested_credential_id: credentialId,
        action: 'reveal_denied',
        success: false,
        reason_code: 'not_found',
        request_id: requestId,
      });
      return jsonError('Credential not found', 404, origin);
    }

    if (cred.deleted_at) {
      await adminClient.from('credential_access_log').insert({
        credential_id: cred.id,
        order_id: cred.order_id,
        accessed_by: adminId,
        requested_credential_id: credentialId,
        action: 'reveal_denied',
        success: false,
        reason_code: 'deleted',
        request_id: requestId,
      });
      return jsonError('Credential not found', 404, origin);
    }

    if (cred.expires_at && new Date(cred.expires_at) < new Date()) {
      await adminClient.from('credential_access_log').insert({
        credential_id: cred.id,
        order_id: cred.order_id,
        accessed_by: adminId,
        requested_credential_id: credentialId,
        action: 'reveal_denied',
        success: false,
        reason_code: 'expired',
        request_id: requestId,
      });
      return jsonError('Credential not found', 404, origin);
    }

    if (!cred.encrypted_payload || !cred.encryption_iv) {
      await adminClient.from('credential_access_log').insert({
        credential_id: cred.id,
        order_id: cred.order_id,
        accessed_by: adminId,
        requested_credential_id: credentialId,
        action: 'reveal_denied',
        success: false,
        reason_code: 'no_encrypted_data',
        request_id: requestId,
      });
      return jsonError('Credential not found', 404, origin);
    }

    try {
      const key = await getEncryptionKey();
      const iv = byteaToUint8Array(cred.encryption_iv);
      const ciphertext = byteaToUint8Array(cred.encrypted_payload);

      const aad = buildCredentialAAD({
        credential_id: cred.id,
        order_id: cred.order_id,
        service_id: cred.service_id,
        key_version: cred.key_version,
      });

      const plaintextBuf = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: aad },
        key,
        ciphertext,
      );

      const plaintext = new TextDecoder().decode(plaintextBuf);
      const decrypted = JSON.parse(plaintext);

      await adminClient.from('credential_access_log').insert({
        credential_id: cred.id,
        order_id: cred.order_id,
        accessed_by: adminId,
        requested_credential_id: credentialId,
        action: 'revealed',
        success: true,
        reason_code: null,
        request_id: requestId,
      });

      return new Response(JSON.stringify({
        credentialId: cred.id,
        orderId: cred.order_id,
        serviceId: cred.service_id,
        decrypted,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) },
      });
    } catch (decryptErr) {
      await adminClient.from('credential_access_log').insert({
        credential_id: cred.id,
        order_id: cred.order_id,
        accessed_by: adminId,
        requested_credential_id: credentialId,
        action: 'reveal_denied',
        success: false,
        reason_code: 'decrypt_failed',
        request_id: requestId,
      });
      return jsonError('Credential could not be decrypted', 500, origin);
    }
  } catch (err) {
    console.error('reveal-order-credentials error:', (err as Error).message);
    return jsonError('An error occurred', 500, origin);
  }
});
