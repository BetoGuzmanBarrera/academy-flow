import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { hasVerifiedAal2 } from '../_shared/adminMfa.ts';
import { getCorsHeaders, handleOptions } from '../_shared/cors.ts';

function jsonError(message: string, status = 400, origin: string | null = null): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleOptions(req);

  const origin = req.headers.get('Origin');
  const responseCorsHeaders = getCorsHeaders(origin);

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
      return jsonError('Forbidden', 403, origin);
    }

    if (!(await hasVerifiedAal2(userClient, jwt))) {
      return jsonError('MFA verification required', 403, origin);
    }

    const body = await req.json();
    const orderId = body?.orderId;
    const newStatus = body?.status;
    if (!orderId || typeof orderId !== 'string') {
      return jsonError('orderId is required', 400, origin);
    }
    if (!newStatus || !['in_progress', 'completed', 'cancelled'].includes(newStatus)) {
      return jsonError('Invalid status', 400, origin);
    }

    // All transitions go through the secure RPC function.
    // admin_id is derived from the JWT, never from the request body.
    const { error } = await adminClient.rpc('transition_order_secure', {
      p_order_id: orderId,
      p_admin_id: adminId,
      p_new_status: newStatus,
    });

    if (error) {
      return jsonError(error.message, 400, origin);
    }

    if (newStatus === 'cancelled') {
      // The database transaction has committed cancellation and its durable
      // reconciliation work. This call only starts work sooner than cron.
      const reconcilerToken = Deno.env.get('STRIPE_RECONCILER_TOKEN');
      if (reconcilerToken) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/reconcile-stripe-payments`, {
            method: 'POST',
            headers: { 'X-Reconciler-Token': reconcilerToken },
          });
        } catch {
          console.error('Stripe reconciliation wake-up failed');
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...responseCorsHeaders },
    });
  } catch (err) {
    console.error('complete-order error:', (err as Error).message);
    return jsonError('An error occurred', 500, origin);
  }
});
