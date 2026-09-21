import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@17.3.1';
import { getCorsHeaders, handleOptions } from '../_shared/cors.ts';
import { createAcademyCheckoutSession } from '../_shared/checkoutSession.ts';

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');

function jsonError(message: string, status = 400, origin: string | null = null): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleOptions(req);
  const origin = req.headers.get('Origin');

  if (!stripeSecretKey) {
    console.error('STRIPE_SECRET_KEY is not configured');
    return jsonError('Payment system is not configured. Contact support.', 503, origin);
  }

  try {
    // ── Auth: require valid JWT ──────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonError('Authentication required', 401, origin);
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
      return jsonError('Invalid session', 401, origin);
    }
    const userId = userData.user.id;

    // ── Parse body ──────────────────────────────────────────────────
    const body = await req.json();
    const orderId = body?.orderId;
    if (!orderId || typeof orderId !== 'string') {
      return jsonError('Order ID is required', 400, origin);
    }

    // ── Fetch order from DB (server-side, never trust client amount) ─
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .select('id, user_id, total_amount, status, payment_status, stripe_checkout_session_id')
      .eq('id', orderId)
      .maybeSingle();

    if (orderError || !order) {
      return jsonError('Order not found', 404, origin);
    }

    // ── Ownership check ──────────────────────────────────────────────
    if (order.user_id !== userId) {
      return jsonError('Order not found', 404, origin);
    }

    // Fulfillment cancellation is terminal, regardless of payment state.
    if (order.status === 'cancelled' || !['pending', 'failed'].includes(order.payment_status)) {
      return jsonError('This order cannot be paid in its current state', 409, origin);
    }

    // ── Validate amount ──────────────────────────────────────────────
    const totalAmount = Number(order.total_amount);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return jsonError('Invalid order amount', 400, origin);
    }

    const amountInCents = Math.round(totalAmount * 100);

    // Stripe minimum for MXN is MXN$10.00 (1000 cents)
    if (amountInCents < 1000) {
      return jsonError('El monto de la orden es menor al mínimo permitido por el sistema de pago (MXN$10.00).', 400, origin);
    }

    // ── Duplicate session protection ─────────────────────────────────
    // If a session already exists for this order, retrieve it instead of
    // creating a new one. Stripe allows retrieving a session by ID.
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-08-27.basil' as Stripe.LatestApiVersion,
    });

    if (order.stripe_checkout_session_id) {
      // Existing session — retrieve it
      let existingSession: Stripe.Checkout.Session;
      try {
        existingSession = await stripe.checkout.sessions.retrieve(
          order.stripe_checkout_session_id,
        );
      } catch {
        return jsonError('Payment session is temporarily unavailable. Try again.', 503, origin);
      }

      if (existingSession.status === 'open') {
        const existingSessionUrl = getValidCheckoutUrl(existingSession.url);
        if (!existingSessionUrl) {
          return jsonError('Payment session is temporarily unavailable. Try again.', 503, origin);
        }
        const { data: mayReuse, error: reuseError } = await adminClient.rpc(
          'can_reuse_stripe_checkout_session_secure',
          { p_order_id: orderId, p_user_id: userId, p_session_id: existingSession.id },
        );
        if (reuseError || !mayReuse) {
          return jsonError('This order cannot be paid in its current state', 409, origin);
        }
        return new Response(
          JSON.stringify({ sessionUrl: existingSessionUrl }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) },
          },
        );
      }

      if (existingSession.status === 'complete') {
        return jsonError('Payment is being confirmed. Try again shortly.', 409, origin);
      }

      if (existingSession.status !== 'expired') {
        return jsonError('Payment session is temporarily unavailable. Try again.', 503, origin);
      }
    }

    const siteUrl = Deno.env.get('SITE_URL') || 'https://academy-flow-mx.bolt.host';
    if (!getValidCheckoutUrl(siteUrl)) {
      return jsonError('Payment system is not configured. Contact support.', 503, origin);
    }
    const { data: reservationKey, error: reservationError } = await adminClient.rpc(
      'reserve_stripe_checkout_session_secure',
      {
        p_order_id: orderId, p_user_id: userId,
        p_previous_session_id: order.stripe_checkout_session_id,
        p_amount: amountInCents, p_site_url: siteUrl,
      },
    );
    if (reservationError || typeof reservationKey !== 'string') {
      return jsonError('This order cannot be paid in its current state', 409, origin);
    }

    const newSession = await createAcademyCheckoutSession(
      stripe,
      orderId,
      userId,
      amountInCents,
      siteUrl,
      reservationKey,
    );
    const sessionUrl = getValidCheckoutUrl(newSession.url);
    if (!sessionUrl) {
      throw new Error('Stripe returned a Checkout Session without a valid URL');
    }
    const saved = await saveSessionId(adminClient, orderId, userId, reservationKey, newSession.id);
    if (!saved) {
      return jsonError('This order cannot be paid in its current state', 409, origin);
    }

    return new Response(
      JSON.stringify({ sessionUrl }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) },
      },
    );
  } catch (err) {
    console.error('create-checkout-session error:', (err as Error).name);
    return jsonError('Could not start payment session. Try again.', 500, origin);
  }
});

function getValidCheckoutUrl(value: string | null): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

async function saveSessionId(
  adminClient: SupabaseClient,
  orderId: string,
  userId: string,
  reservationKey: string,
  sessionId: string,
): Promise<boolean> {
  const { data, error } = await adminClient.rpc('record_stripe_checkout_session_secure', {
    p_order_id: orderId,
    p_user_id: userId,
    p_key: reservationKey,
    p_session_id: sessionId,
  });

  if (error) {
    console.error('Failed to save checkout session ID:', error.code);
    throw new Error('Failed to save checkout session ID');
  }
  return data === true;
}
