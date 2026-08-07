import { getCorsHeaders, handleOptions } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface CredentialMetadata {
  credentialId: string;
  orderId: string;
  serviceId: string;
  serviceName: string;
  createdAt: string;
  expiresAt: string | null;
  deletedAt: string | null;
  hasEncryptedPayload: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleOptions(req);
  const origin = req.headers.get('Origin');

  const cors = getCorsHeaders(origin);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...cors },
    });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || profile.role !== 'admin') {
    return json({ error: 'Forbidden' }, 403);
  }

  const { data: credentials, error: credError } = await adminClient
    .from('order_credentials')
    .select('id, order_id, service_id, created_at, expires_at, deleted_at, encrypted_payload')
    .order('created_at', { ascending: false });

  if (credError) {
    return json({ error: 'Failed to load credentials' }, 500);
  }

  const serviceIds = [...new Set((credentials ?? []).map((c: any) => c.service_id))];
  const { data: services } = await adminClient
    .from('services')
    .select('id, name')
    .in('id', serviceIds.length > 0 ? serviceIds : ['00000000-0000-0000-0000-000000000000']);

  const serviceNameMap: Record<string, string> = {};
  for (const s of services ?? []) {
    serviceNameMap[s.id] = s.name;
  }

  const result: CredentialMetadata[] = (credentials ?? []).map((c: any) => ({
    credentialId: c.id,
    orderId: c.order_id,
    serviceId: c.service_id,
    serviceName: serviceNameMap[c.service_id] ?? c.service_id,
    createdAt: c.created_at,
    expiresAt: c.expires_at,
    deletedAt: c.deleted_at,
    hasEncryptedPayload: c.encrypted_payload !== null,
  }));

  return json({ credentials: result });
});
