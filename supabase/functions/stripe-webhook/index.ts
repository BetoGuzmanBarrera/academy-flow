import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@17.3.1';
import { getCorsHeaders } from '../_shared/cors.ts';

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(null) },
  });
}

Deno.serve(async (req: Request) => {
  // No OPTIONS preflight needed — Stripe sends POST directly, no browser CORS.
  // But respond gracefully just in case.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: getCorsHeaders(null) });
  }

  if (!stripeSecretKey || !webhookSecret) {
    console.error('Stripe secrets not configured');
    return jsonError('Webhook not configured', 503);
  }

  try {
    // ── Read raw body for signature verification ─────────────────────
    const rawBody = await req.text();
    const signature = req.headers.get('Stripe-Signature');

    if (!signature) {
      return jsonError('Missing Stripe signature', 400);
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-08-27.basil' as Stripe.LatestApiVersion,
    });

    // ── Verify webhook signature ──────────────────────────────────────
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        webhookSecret,
      );
    } catch {
      console.error('Stripe signature verification failed');
      return jsonError('Invalid signature', 400);
    }

    // ── Idempotency: check if event already processed ────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: existing } = await adminClient
      .from('stripe_webhook_events')
      .select('event_id')
      .eq('event_id', event.id)
      .maybeSingle();

    if (existing) {
      // Already processed — return 200 without side effects
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(null) },
      });
    }

    // ── Process event ─────────────────────────────────────────────────
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      // Only process one-time payments
      if (session.mode !== 'payment') {
        await recordEvent(adminClient, event.id, event.type);
        return new Response(JSON.stringify({ received: true, skipped: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...getCorsHeaders(null) },
        });
      }

      // Verify payment was successful
      if (session.payment_status !== 'paid') {
        await recordEvent(adminClient, event.id, event.type);
        return new Response(JSON.stringify({ received: true, skipped: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...getCorsHeaders(null) },
        });
      }

      // Extract metadata
      const orderId = session.metadata?.order_id;
      if (!orderId) {
        console.error('No order_id in session metadata');
        await recordEvent(adminClient, event.id, event.type);
        return jsonError('Missing order metadata', 400);
      }

      // Verify currency
      if (session.currency !== 'mxn') {
        console.error('Unexpected currency:', session.currency);
        await recordEvent(adminClient, event.id, event.type);
        return jsonError('Currency mismatch', 400);
      }

      // ── Verify amount matches DB ───────────────────────────────────
      const { data: order, error: orderError } = await adminClient
        .from('orders')
        .select('id, total_amount, payment_status')
        .eq('id', orderId)
        .maybeSingle();

      if (orderError || !order) {
        console.error('Order not found for event:', event.id);
        await recordEvent(adminClient, event.id, event.type);
        return jsonError('Order not found', 404);
      }

      const dbAmountCents = Math.round(Number(order.total_amount) * 100);
      const stripeAmountCents = session.amount_total ?? 0;

      if (dbAmountCents !== stripeAmountCents) {
        console.error('Amount mismatch: db=%d stripe=%d', dbAmountCents, stripeAmountCents);
        await recordEvent(adminClient, event.id, event.type);
        return jsonError('Amount verification failed', 400);
      }

      // ── Get Payment Intent ID ───────────────────────────────────────
      const paymentIntentId = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

      if (!paymentIntentId) {
        console.error('No payment intent ID in session');
        await recordEvent(adminClient, event.id, event.type);
        return jsonError('No payment intent', 400);
      }

      // ── Mark order as paid via secure RPC ───────────────────────────
      const { error: rpcError } = await adminClient.rpc('mark_order_paid_secure', {
        p_order_id: orderId,
        p_payment_id: paymentIntentId,
        p_checkout_session_id: session.id,
      });

      if (rpcError) {
        console.error('mark_order_paid_secure error:', rpcError.code);
        // Don't record event as processed — allow Stripe to retry
        return jsonError('Could not mark order as paid', 500);
      }

      // ── Record event as processed ──────────────────────────────────
      await recordEvent(adminClient, event.id, event.type);

      return new Response(JSON.stringify({ received: true, processed: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(null) },
      });
    }

    // Unhandled event type — record and acknowledge
    await recordEvent(adminClient, event.id, event.type);
    return new Response(JSON.stringify({ received: true, unhandled: event.type }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(null) },
    });
  } catch (err) {
    console.error('stripe-webhook error:', (err as Error).name);
    return jsonError('Webhook processing failed', 500);
  }
});

async function recordEvent(
  adminClient: ReturnType<typeof createClient>,
  eventId: string,
  eventType: string,
): Promise<void> {
  const { error } = await adminClient
    .from('stripe_webhook_events')
    .insert({ event_id: eventId, event_type: eventType });

  if (error) {
    console.error('Failed to record webhook event:', error.code);
  }
}
