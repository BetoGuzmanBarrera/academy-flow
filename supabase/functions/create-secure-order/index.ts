import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCredentialAAD } from '../_shared/aad.ts';
import { getCorsHeaders, handleOptions } from '../_shared/cors.ts';

interface RawCredential {
  service_id: string;
  platformEmail?: string;
  platformPassword?: string;
  aleksAccount?: string;
  additionalInfo?: string;
}

interface EncryptedCredential {
  credential_id: string;
  service_id: string;
  encrypted_payload: string;
  encryption_iv: string;
  key_version: number;
}

const KEY_VERSION = 1;
const MAX_CIPHERTEXT_BASE64 = 8192;

function jsonError(message: string, status = 400, origin: string | null = null): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) },
  });
}

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyHex = Deno.env.get('CREDENTIALS_ENCRYPTION_KEY_V1');
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('Encryption key not configured');
  }
  const keyBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    keyBytes[i] = parseInt(keyHex.substring(i * 2, i * 2 + 2), 16);
  }
  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
}

function validatePlaintext(cred: RawCredential): {
  platformEmail: string;
  platformPassword: string;
  aleksAccount: string;
  additionalInfo: string;
} {
  const platformEmail = (cred.platformEmail ?? '').trim();
  const platformPassword = cred.platformPassword ?? '';
  const aleksAccount = (cred.aleksAccount ?? '').trim();
  const additionalInfo = (cred.additionalInfo ?? '').trim();

  if (platformEmail.length > 254) throw new Error('platformEmail exceeds 254 characters');
  if (platformPassword.length > 512) throw new Error('platformPassword exceeds 512 characters');
  if (aleksAccount.length > 200) throw new Error('aleksAccount exceeds 200 characters');
  if (additionalInfo.length > 2000) throw new Error('additionalInfo exceeds 2000 characters');

  return { platformEmail, platformPassword, aleksAccount, additionalInfo };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
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
    const userId = userData.user.id;

    const body = await req.json();
    if (!body || typeof body !== 'object') {
      return jsonError('Invalid request body', 400, origin);
    }

    const paymentMethod = body.paymentMethod;
    const referralCode = body.referralCode ?? null;
    const rawCredentials: RawCredential[] = body.credentials ?? [];
    const billing = body.billing ?? null;

    if (!paymentMethod || !['card', 'paypal'].includes(paymentMethod)) {
      return jsonError('Invalid payment method', 400, origin);
    }
    if (!Array.isArray(rawCredentials) || rawCredentials.length === 0) {
      return jsonError('No credentials provided', 400, origin);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const key = await getEncryptionKey();
    const orderId = crypto.randomUUID();

    const encryptedCredentials: EncryptedCredential[] = [];
    const seenServiceIds = new Set<string>();

    for (const cred of rawCredentials) {
      if (!cred.service_id || typeof cred.service_id !== 'string') {
        return jsonError('Invalid service_id in credentials', 400, origin);
      }
      if (seenServiceIds.has(cred.service_id)) {
        return jsonError('Duplicate credentials for the same service', 400, origin);
      }
      seenServiceIds.add(cred.service_id);

      const validated = validatePlaintext(cred);
      const credentialId = crypto.randomUUID();

      const plaintext = JSON.stringify({
        platformEmail: validated.platformEmail,
        platformPassword: validated.platformPassword,
        aleksAccount: validated.aleksAccount,
        additionalInfo: validated.additionalInfo,
      });

      const iv = crypto.getRandomValues(new Uint8Array(12));
      const aad = buildCredentialAAD({
        credential_id: credentialId,
        order_id: orderId,
        service_id: cred.service_id,
        key_version: KEY_VERSION,
      });

      const ciphertextBuf = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: aad },
        key,
        new TextEncoder().encode(plaintext),
      );

      const ciphertextBytes = new Uint8Array(ciphertextBuf);
      const encryptedPayload = bytesToBase64(ciphertextBytes);
      if (encryptedPayload.length > MAX_CIPHERTEXT_BASE64) {
        return jsonError('Encrypted payload too large', 400, origin);
      }

      encryptedCredentials.push({
        credential_id: credentialId,
        service_id: cred.service_id,
        encrypted_payload: encryptedPayload,
        encryption_iv: bytesToBase64(iv),
        key_version: KEY_VERSION,
      });
    }

    const { data: rpcData, error: rpcError } = await adminClient.rpc('create_secure_order', {
      p_order_id: orderId,
      p_user_id: userId,
      p_payment_method: paymentMethod,
      p_referral_code: referralCode,
      p_encrypted_credentials: encryptedCredentials,
      p_billing: billing,
    }).single();

    if (rpcError) {
      console.error('RPC error:', rpcError.code, rpcError.message);
      const message = rpcError.code === 'P0001' ? rpcError.message : 'Order could not be created';
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) },
      });
    }

    return new Response(JSON.stringify({
      orderId: rpcData.order_id,
      totalAmount: rpcData.total_amount,
      discountAmount: rpcData.discount_amount,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) },
    });
  } catch (err) {
    console.error('create-secure-order error:', (err as Error).message);
    return jsonError('An error occurred while creating the order', 500, origin);
  }
});
