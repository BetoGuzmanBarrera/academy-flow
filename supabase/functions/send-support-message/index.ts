import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isIP } from 'node:net';
import { getCorsHeaders, handleOptions } from '../_shared/cors.ts';

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 320;
const MAX_MESSAGE_LENGTH = 4000;
const AUTHENTICATED_RATE_LIMIT = 5;
const AUTHENTICATED_RATE_WINDOW_SECONDS = 10 * 60;
const GUEST_RATE_LIMIT = 3;
const GUEST_RATE_WINDOW_SECONDS = 15 * 60;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORBIDDEN_FIELDS = [
  'user_id',
  'userId',
  'admin_response',
  'adminResponse',
  'status',
];
type SenderProfile = {
  first_name: string | null;
  last_name: string | null;
};

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) },
  });
}

function jsonError(message: string, status: number, origin: string | null): Response {
  return jsonResponse({ error: message }, status, origin);
}

function normalizeIp(value: string | null): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;

  const version = isIP(candidate);
  if (version === 4) return candidate;
  if (version === 6) {
    return new URL(`http://[${candidate}]/`).hostname.slice(1, -1);
  }

  return null;
}

function getClientIp(req: Request): string {
  const cloudflareIp = normalizeIp(req.headers.get('cf-connecting-ip'));
  if (cloudflareIp) return cloudflareIp;

  const forwardedValues = req.headers.get('x-forwarded-for')?.split(',');
  const gatewayAppendedIp = normalizeIp(forwardedValues?.at(-1) ?? null);
  if (gatewayAppendedIp) return gatewayAppendedIp;

  return normalizeIp(req.headers.get('x-real-ip')) ?? 'unknown';
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function isForbiddenPayload(body: Record<string, unknown>): boolean {
  return FORBIDDEN_FIELDS.some((field) => Object.hasOwn(body, field));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleOptions(req);

  const origin = req.headers.get('Origin');
  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405, origin);
  }

  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonError('Invalid request body', 400, origin);
    }

    const payload = body as Record<string, unknown>;
    if (isForbiddenPayload(payload)) {
      return jsonError('Unsupported support message fields', 400, origin);
    }

    const message = typeof payload.message === 'string' ? payload.message.trim() : '';
    if (!message || message.length > MAX_MESSAGE_LENGTH) {
      return jsonError(`Message must be between 1 and ${MAX_MESSAGE_LENGTH} characters`, 400, origin);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization');

    let authenticatedUser: {
      id: string;
      email?: string;
      user_metadata?: Record<string, unknown>;
    } | null = null;
    let authenticatedProfile: SenderProfile | null = null;

    if (authHeader) {
      const bearerMatch = /^Bearer ([^\s]+)$/.exec(authHeader);
      if (!bearerMatch) return jsonError('Invalid authorization header', 401, origin);

      const bearerToken = bearerMatch[1];
      if (bearerToken !== anonKey) {
        const userClient = createClient(supabaseUrl, anonKey, {
          auth: { persistSession: false },
          global: { headers: { Authorization: authHeader } },
        });
        const { data, error } = await userClient.auth.getUser();
        if (error || !data.user) return jsonError('Invalid user token', 401, origin);
        authenticatedUser = data.user;

        const { data: profile, error: profileError } = await userClient
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', authenticatedUser.id)
          .maybeSingle();

        if (profileError) {
          console.error('Failed to load support sender profile:', profileError.code);
          return jsonError('Support is temporarily unavailable. Try again.', 503, origin);
        }

        authenticatedProfile = profile as SenderProfile | null;
      }
    }

    let userName: string;
    let userEmail: string;

    if (authenticatedUser) {
      userEmail = authenticatedUser.email?.trim().toLowerCase() ?? '';

      const profileName = `${authenticatedProfile?.first_name ?? ''} ${authenticatedProfile?.last_name ?? ''}`.trim();
      const metadataName = authenticatedUser.user_metadata?.full_name;
      userName = profileName
        || (typeof metadataName === 'string' ? metadataName.trim() : '')
        || userEmail.split('@')[0]
        || 'Usuario';
    } else {
      userName = typeof payload.name === 'string' ? payload.name.trim() : '';
      userEmail = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    }

    if (!userName || userName.length > MAX_NAME_LENGTH) {
      return jsonError(`Name must be between 1 and ${MAX_NAME_LENGTH} characters`, 400, origin);
    }
    if (
      !userEmail
      || userEmail.length > MAX_EMAIL_LENGTH
      || !EMAIL_PATTERN.test(userEmail)
    ) {
      return jsonError('Invalid email address', 400, origin);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const actor = authenticatedUser
      ? `user:${authenticatedUser.id}`
      : `ip:${getClientIp(req)}`;
    const actorHash = await sha256Hex(actor);
    const maxRequests = authenticatedUser ? AUTHENTICATED_RATE_LIMIT : GUEST_RATE_LIMIT;
    const windowSeconds = authenticatedUser
      ? AUTHENTICATED_RATE_WINDOW_SECONDS
      : GUEST_RATE_WINDOW_SECONDS;

    const { data: allowed, error: rateError } = await adminClient.rpc(
      'check_support_message_rate_limit',
      {
        p_actor_hash: actorHash,
        p_max_requests: maxRequests,
        p_window_seconds: windowSeconds,
      },
    );

    if (rateError) {
      console.error('Support rate limiter failed:', rateError.code);
      return jsonError('Support is temporarily unavailable. Try again.', 503, origin);
    }
    if (!allowed) {
      return jsonError('Too many support messages. Try again later.', 429, origin);
    }

    const { data: supportMessage, error: insertError } = await adminClient
      .from('support_messages')
      .insert({
        user_id: authenticatedUser?.id ?? null,
        user_email: userEmail,
        user_name: userName,
        message,
        status: 'pending',
        admin_response: null,
      })
      .select('id, user_id, user_email, user_name, message, status, admin_response, created_at, updated_at')
      .single();

    if (insertError || !supportMessage) {
      console.error('Failed to save support message:', insertError?.code);
      return jsonError('Could not send support message. Try again.', 500, origin);
    }

    return jsonResponse({ message: supportMessage }, 201, origin);
  } catch (err) {
    console.error('send-support-message error:', (err as Error).name);
    return jsonError('Could not send support message. Try again.', 500, origin);
  }
});
