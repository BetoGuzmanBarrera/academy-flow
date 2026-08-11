import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCredentialAAD } from '../_shared/aad.ts';
import { getCorsHeaders, handleOptions } from '../_shared/cors.ts';

type AccessMethod = 'aleks' | 'uvm_safekey' | 'coursera';

interface RawCredential {
  service_id: string;
  platform?: string;
  accessMethod?: AccessMethod | null;
  username?: string;
  email?: string;
  password?: string;
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

const FORBIDDEN_KEYS = [
  'otp', 'mfaCode', 'safeKeyCode', 'authenticatorCode',
  'totp', 'backupCode', 'recoveryCode',
];

const ALLOWED_PAYLOAD_KEYS = new Set([
  'platform', 'accessMethod', 'username', 'email', 'password', 'additionalInfo',
]);

function jsonError(message: string, status = 400, origin: string | null = null): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) },
  });
}

function diagnosticError(
  stage: 'auth' | 'validation' | 'encryption' | 'rpc' | 'response',
  code: string | null,
  _message: string,
  origin: string | null,
  status = 400,
): Response {
  const safeMessage = code === 'P0001' ? _message : 'Order could not be created';
  return new Response(JSON.stringify({
    diagnostic: true,
    stage,
    code,
    message: safeMessage,
    requestId: null,
  }), {
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
  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
}

function normalizePlatform(name: string): string {
  return name.trim().toUpperCase();
}

function isAleksPlatform(normalized: string): boolean {
  return normalized === 'ALEKS UNIVERSIDAD' || normalized === 'ALEKS PREPARATORIA';
}

function isCourseraPlatform(normalized: string): boolean {
  return normalized === 'COURSERA EXCEL';
}

function isCambridgePlatform(normalized: string): boolean {
  return normalized === 'CAMBRIDGE ONE';
}

function isFrenchPlatform(normalized: string): boolean {
  return normalized === 'FRANCÉS — BIBLIO EXOS';
}

function validateCredential(
  cred: RawCredential,
  categoryName: string,
): {
  platform: string;
  accessMethod: AccessMethod | null;
  username: string;
  email: string;
  password: string;
  additionalInfo: string;
} {
  const platform = normalizePlatform(categoryName);
  const accessMethod = cred.accessMethod ?? null;
  const username = (cred.username ?? '').trim();
  const email = (cred.email ?? '').trim().toLowerCase();
  const password = cred.password ?? '';
  const additionalInfo = (cred.additionalInfo ?? '').trim();

  if (username.length > 200) throw new Error('username exceeds 200 characters');
  if (email.length > 254) throw new Error('email exceeds 254 characters');
  if (password.length > 512) throw new Error('password exceeds 512 characters');
  if (additionalInfo.length > 2000) throw new Error('additionalInfo exceeds 2000 characters');

  for (const key of Object.keys(cred)) {
    if (!ALLOWED_PAYLOAD_KEYS.has(key)) {
      throw new Error('invalid credential field');
    }
  }

  for (const forbidden of FORBIDDEN_KEYS) {
    if (forbidden in cred) {
      throw new Error('invalid credential field');
    }
  }

  if (isAleksPlatform(platform)) {
    if (accessMethod === 'aleks') {
      if (!username) throw new Error('username is required');
      if (!password) throw new Error('password is required');
      if (email) throw new Error('invalid credential field');
    } else if (accessMethod === 'uvm_safekey') {
      if (!email) throw new Error('email is required');
      if (!password) throw new Error('password is required');
      if (username) throw new Error('invalid credential field');
    } else {
      throw new Error('invalid access method');
    }
  } else if (isCourseraPlatform(platform)) {
    if (accessMethod === 'coursera') {
      if (!email) throw new Error('email is required');
      if (!password) throw new Error('password is required');
      if (username) throw new Error('invalid credential field');
    } else if (accessMethod === 'uvm_safekey') {
      if (!email) throw new Error('email is required');
      if (!password) throw new Error('password is required');
      if (username) throw new Error('invalid credential field');
    } else {
      throw new Error('invalid access method');
    }
  } else if (isCambridgePlatform(platform)) {
    if (accessMethod !== null) throw new Error('invalid credential field');
    if (!email) throw new Error('email is required');
    if (!password) throw new Error('password is required');
    if (username) throw new Error('invalid credential field');
  } else if (isFrenchPlatform(platform)) {
    if (accessMethod !== null) throw new Error('invalid credential field');
    if (!username) throw new Error('username is required');
    if (!password) throw new Error('password is required');
    if (email) throw new Error('invalid credential field');
  } else {
    throw new Error('unsupported platform');
  }

  return { platform, accessMethod, username, email, password, additionalInfo };
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
      return diagnosticError('auth', null, 'Missing or invalid auth header', origin, 401);
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
      return diagnosticError('auth', null, 'JWT validation failed', origin, 401);
    }
    const userId = userData.user.id;

    const body = await req.json();
    if (!body || typeof body !== 'object') {
      return diagnosticError('validation', null, 'Invalid request body', origin);
    }

    const paymentMethod = body.paymentMethod;
    const referralCode = body.referralCode ?? null;
    const rawCredentials: RawCredential[] = body.credentials ?? [];
    const billing = body.billing ?? null;

    if (!paymentMethod || !['card', 'paypal'].includes(paymentMethod)) {
      return diagnosticError('validation', null, 'Invalid payment method', origin);
    }
    if (!Array.isArray(rawCredentials) || rawCredentials.length === 0) {
      return diagnosticError('validation', null, 'No credentials provided', origin);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const serviceIds = rawCredentials.map((c) => c.service_id).filter(Boolean);
    if (serviceIds.length !== rawCredentials.length) {
      return diagnosticError('validation', null, 'Invalid service_id in credentials', origin);
    }

    const { data: serviceRows } = await adminClient
      .from('services')
      .select('id, category_id, is_active')
      .in('id', serviceIds.length > 0 ? serviceIds : ['00000000-0000-0000-0000-000000000000']);

    const { data: categoryRows } = await adminClient
      .from('categories')
      .select('id, name')
      .in(
        'id',
        [...new Set((serviceRows ?? []).map((s: any) => s.category_id))].length > 0
          ? [...new Set((serviceRows ?? []).map((s: any) => s.category_id))]
          : ['00000000-0000-0000-0000-000000000000'],
      );

    const categoryMap: Record<string, string> = {};
    for (const c of categoryRows ?? []) {
      categoryMap[c.id] = c.name;
    }
    const serviceCategoryMap: Record<string, string> = {};
    for (const s of serviceRows ?? []) {
      serviceCategoryMap[s.id] = categoryMap[s.category_id] ?? '';
    }

    let key: CryptoKey;
    try {
      key = await getEncryptionKey();
    } catch {
      return diagnosticError('encryption', null, 'Encryption key unavailable', origin);
    }

    const orderId = crypto.randomUUID();

    const encryptedCredentials: EncryptedCredential[] = [];
    const seenServiceIds = new Set<string>();

    for (const cred of rawCredentials) {
      if (!cred.service_id || typeof cred.service_id !== 'string') {
        return diagnosticError('validation', null, 'Invalid service_id in credentials', origin);
      }
      if (seenServiceIds.has(cred.service_id)) {
        return diagnosticError('validation', null, 'Duplicate credentials for the same service', origin);
      }
      seenServiceIds.add(cred.service_id);

      const categoryName = serviceCategoryMap[cred.service_id];
      if (!categoryName) {
        return diagnosticError('validation', null, 'Service not found', origin);
      }

      let validated: ReturnType<typeof validateCredential>;
      try {
        validated = validateCredential(cred, categoryName);
      } catch (err) {
        return diagnosticError('validation', null, (err as Error).message, origin);
      }

      const credentialId = crypto.randomUUID();

      const plaintext = JSON.stringify({
        platform: validated.platform,
        accessMethod: validated.accessMethod,
        username: validated.username || undefined,
        email: validated.email || undefined,
        password: validated.password || undefined,
        additionalInfo: validated.additionalInfo || undefined,
      });

      const iv = crypto.getRandomValues(new Uint8Array(12));
      const aad = buildCredentialAAD({
        credential_id: credentialId,
        order_id: orderId,
        service_id: cred.service_id,
        key_version: KEY_VERSION,
      });

      let ciphertextBuf: ArrayBuffer;
      try {
        ciphertextBuf = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv, additionalData: aad },
          key,
          new TextEncoder().encode(plaintext),
        );
      } catch {
        return diagnosticError('encryption', null, 'AES-GCM encryption failed', origin);
      }

      const ciphertextBytes = new Uint8Array(ciphertextBuf);
      const encryptedPayload = bytesToBase64(ciphertextBytes);
      if (encryptedPayload.length > MAX_CIPHERTEXT_BASE64) {
        return diagnosticError('encryption', null, 'Encrypted payload too large', origin);
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
      const safeCode = rpcError.code ?? null;
      const safeMessage = rpcError.code === 'P0001' ? rpcError.message : 'Order could not be created';
      return diagnosticError('rpc', safeCode, safeMessage, origin);
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
    const errName = (err as Error).name ?? 'Error';
    console.error('create-secure-order error:', errName);
    return diagnosticError('response', null, 'Unexpected error', origin, 500);
  }
});
