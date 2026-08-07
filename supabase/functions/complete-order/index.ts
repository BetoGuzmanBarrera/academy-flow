import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleOptions } from '../_shared/cors.ts';

function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(null) },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleOptions(req);

  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonError('Unauthorized', 401);
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
      return jsonError('Unauthorized', 401);
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
      return jsonError('Forbidden', 403);
    }

    const body = await req.json();
    const orderId = body?.orderId;
    const newStatus = body?.status;
    if (!orderId || typeof orderId !== 'string') {
      return jsonError('orderId is required');
    }
    if (!newStatus || !['pending', 'completed', 'cancelled'].includes(newStatus)) {
      return jsonError('Invalid status');
    }

    if (newStatus === 'completed') {
      const { error } = await adminClient.rpc('complete_order_secure', {
        p_order_id: orderId,
        p_admin_id: adminId,
      });
      if (error) {
        return jsonError(error.message, 400);
      }
    } else if (newStatus === 'pending') {
      const { error } = await adminClient.rpc('reopen_order_secure', {
        p_order_id: orderId,
        p_admin_id: adminId,
      });
      if (error) {
        return jsonError(error.message, 400);
      }
    } else {
      const { error } = await adminClient
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId)
        .eq('status', 'pending');
      if (error) {
        return jsonError(error.message, 400);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    console.error('complete-order error:', (err as Error).message);
    return jsonError('An error occurred', 500);
  }
});
