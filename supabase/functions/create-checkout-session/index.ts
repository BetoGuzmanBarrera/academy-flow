import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@17.3.1';
import { getCorsHeaders, handleOptions } from '../_shared/cors.ts';

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
      .select('id, user_id, total_amount, payment_status, stripe_checkout_session_id')
      .eq('id', orderId)
      .maybeSingle();

    if (orderError || !order) {
      return jsonError('Order not found', 404, origin);
    }

    // ── Ownership check ──────────────────────────────────────────────
    if (order.user_id !== userId) {
      return jsonError('Order not found', 404, origin);
    }

    // ── Only allow pending or failed orders ──────────────────────────
    if (!['pending', 'failed'].includes(order.payment_status)) {
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

    let sessionUrl: string;
    let sessionId: string;

    if (order.stripe_checkout_session_id) {
      // Existing session — retrieve it
      try {
        const existingSession = await stripe.checkout.sessions.retrieve(
          order.stripe_checkout_session_id,
        );
        // If the session is still open or expired, reuse its URL
        if (existingSession.url) {
          sessionUrl = existingSession.url;
          sessionId = existingSession.id;
        } else {
          // Session has no URL (e.g. expired) — create a new one
          const newSession = await createNewSession(
            stripe,
            orderId,
            userId,
            amountInCents,
          );
          sessionUrl = newSession.url!;
          sessionId = newSession.id;
          await saveSessionId(adminClient, orderId, sessionId);
        }
      } catch {
        // Retrieval failed — create a new session
        const newSession = await createNewSession(stripe, orderId, userId, amountInCents);
        sessionUrl = newSession.url!;
        sessionId = newSession.id;
        await saveSessionId(adminClient, orderId, sessionId);
      }
    } else {
      // No existing session — create one
      const newSession = await createNewSession(stripe, orderId, userId, amountInCents);
      sessionUrl = newSession.url!;
      sessionId = newSession.id;
      await saveSessionId(adminClient, orderId, sessionId);
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

async function createNewSession(
  stripe: Stripe,
  orderId: string,
  userId: string,
  amountInCents: number,
): Promise<Stripe.Checkout.Session> {
  const siteUrl = Deno.env.get('SITE_URL') || 'https://academy-flow-mx.bolt.host';

  return stripe.checkout.sessions.create({
    mode: 'payment',
    currency: 'mxn',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'mxn',
          unit_amount: amountInCents,
          product_data: {
            name: `Orden #${orderId.slice(0, 8)}`,
          },
        },
      },
    ],
    metadata: {
      order_id: orderId,
      user_id: userId,
    },
    payment_intent_data: {
      metadata: {
        order_id: orderId,
      },
    },
    success_url: `${siteUrl}/?payment=success&order=${orderId}`,
    cancel_url: `${siteUrl}/?payment=cancelled&order=${orderId}`,
  });
}

async function saveSessionId(
  adminClient: ReturnType<typeof createClient>,
  orderId: string,
  sessionId: string,
): Promise<void> {
  const { error } = await adminClient
    .from('orders')
    .update({ stripe_checkout_session_id: sessionId, updated_at: new Date().toISOString() })
    .eq('id', orderId);

  if (error) {
    console.error('Failed to save checkout session ID:', error.code);
  }
}
