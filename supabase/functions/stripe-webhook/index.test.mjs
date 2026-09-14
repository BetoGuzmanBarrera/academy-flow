import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'https://esm.sh/@supabase/supabase-js@2') {
      return { url: 'stripe-webhook-test:supabase', shortCircuit: true };
    }
    if (specifier === 'https://esm.sh/stripe@17.3.1') {
      return { url: 'stripe-webhook-test:stripe', shortCircuit: true };
    }
    if (specifier.endsWith('/_shared/cors.ts')) {
      return { url: 'stripe-webhook-test:cors', shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === 'stripe-webhook-test:supabase') {
      return {
        format: 'module',
        source: 'export const createClient = (...args) => globalThis.__stripeWebhookTestHooks.createClient(...args);',
        shortCircuit: true,
      };
    }
    if (url === 'stripe-webhook-test:stripe') {
      return {
        format: 'module',
        source: 'export default class Stripe { constructor(...args) { return globalThis.__stripeWebhookTestHooks.createStripe(...args); } }',
        shortCircuit: true,
      };
    }
    if (url === 'stripe-webhook-test:cors') {
      return {
        format: 'module',
        source: "export const getCorsHeaders = () => ({ 'Access-Control-Allow-Origin': '*' });",
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

let webhookHandler;

globalThis.__stripeWebhookTestHooks = {};
globalThis.Deno = {
  env: {
    get(name) {
      return {
        STRIPE_SECRET_KEY: 'sk_test_secret',
        STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      }[name];
    },
  },
  serve(handler) {
    webhookHandler = handler;
  },
};

await import('./index.ts?atomic-webhook-test');

const checkoutEvent = {
  id: 'evt_checkout_completed',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_checkout',
      mode: 'payment',
      payment_status: 'paid',
      metadata: { order_id: '11111111-1111-4111-8111-111111111111' },
      currency: 'mxn',
      amount_total: 12549,
      payment_intent: 'pi_checkout',
    },
  },
};

function createHarness({
  event = checkoutEvent,
  signatureValid = true,
  existingEvent = null,
  lookupError = null,
  order = {
    id: checkoutEvent.data.object.metadata.order_id,
    total_amount: '125.49',
    payment_status: 'pending',
  },
  rpcResults = [{ data: 'processed', error: null }],
  recordError = null,
} = {}) {
  const state = {
    signatureChecks: 0,
    eventLookups: 0,
    orderReads: 0,
    rpcCalls: [],
    eventInserts: [],
  };
  const pendingRpcResults = [...rpcResults];

  globalThis.__stripeWebhookTestHooks.createStripe = () => ({
    webhooks: {
      async constructEventAsync() {
        state.signatureChecks += 1;
        if (!signatureValid) throw new Error('invalid_signature');
        return event;
      },
    },
  });

  globalThis.__stripeWebhookTestHooks.createClient = () => ({
    from(table) {
      if (table === 'stripe_webhook_events') {
        let operation;
        return {
          select() {
            operation = 'select';
            return this;
          },
          eq() {
            return this;
          },
          async maybeSingle() {
            assert.equal(operation, 'select');
            state.eventLookups += 1;
            return { data: existingEvent, error: lookupError };
          },
          async insert(payload) {
            state.eventInserts.push(payload);
            return { error: recordError };
          },
        };
      }

      if (table === 'orders') {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          async maybeSingle() {
            state.orderReads += 1;
            return { data: order, error: order ? null : { code: 'not_found' } };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
    async rpc(name, args) {
      state.rpcCalls.push({ name, args });
      return pendingRpcResults.shift() ?? { data: null, error: { code: 'missing_result' } };
    },
  });

  return state;
}

function requestFor({ signature = 'valid-test-signature' } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (signature !== null) headers['Stripe-Signature'] = signature;
  return new Request('https://project.supabase.co/functions/v1/stripe-webhook', {
    method: 'POST',
    headers,
    body: JSON.stringify({ synthetic: true }),
  });
}

async function responseBody(response) {
  return { status: response.status, body: await response.json() };
}

test('rejects a request without Stripe-Signature before database access', async () => {
  const state = createHarness();

  const result = await responseBody(await webhookHandler(requestFor({ signature: null })));

  assert.deepEqual(result, { status: 400, body: { error: 'Missing Stripe signature' } });
  assert.equal(state.signatureChecks, 0);
  assert.equal(state.eventLookups, 0);
  assert.equal(state.rpcCalls.length, 0);
});

test('rejects an invalid Stripe signature before database access', async () => {
  const state = createHarness({ signatureValid: false });

  const result = await responseBody(await webhookHandler(requestFor()));

  assert.deepEqual(result, { status: 400, body: { error: 'Invalid signature' } });
  assert.equal(state.signatureChecks, 1);
  assert.equal(state.eventLookups, 0);
  assert.equal(state.rpcCalls.length, 0);
});

test('returns an existing event as duplicate before payment processing', async () => {
  const state = createHarness({ existingEvent: { event_id: checkoutEvent.id } });

  const result = await responseBody(await webhookHandler(requestFor()));

  assert.deepEqual(result, { status: 200, body: { received: true, duplicate: true } });
  assert.equal(state.orderReads, 0);
  assert.equal(state.rpcCalls.length, 0);
});

test('keeps MXN currency verification before the atomic RPC', async () => {
  const event = structuredClone(checkoutEvent);
  event.data.object.currency = 'usd';
  const state = createHarness({ event });

  const result = await responseBody(await webhookHandler(requestFor()));

  assert.deepEqual(result, { status: 400, body: { error: 'Currency mismatch' } });
  assert.equal(state.rpcCalls.length, 0);
  assert.equal(state.eventInserts.length, 1);
});

test('keeps database amount verification before the atomic RPC', async () => {
  const state = createHarness({
    order: {
      id: checkoutEvent.data.object.metadata.order_id,
      total_amount: '125.50',
      payment_status: 'pending',
    },
  });

  const result = await responseBody(await webhookHandler(requestFor()));

  assert.deepEqual(result, { status: 400, body: { error: 'Amount verification failed' } });
  assert.equal(state.rpcCalls.length, 0);
  assert.equal(state.eventInserts.length, 1);
});

test('keeps Payment Intent validation before the atomic RPC', async () => {
  const event = structuredClone(checkoutEvent);
  event.data.object.payment_intent = null;
  const state = createHarness({ event });

  const result = await responseBody(await webhookHandler(requestFor()));

  assert.deepEqual(result, { status: 400, body: { error: 'No payment intent' } });
  assert.equal(state.rpcCalls.length, 0);
  assert.equal(state.eventInserts.length, 1);
});

test('returns processed only after the atomic checkout RPC succeeds', async () => {
  const state = createHarness();

  const result = await responseBody(await webhookHandler(requestFor()));

  assert.deepEqual(result, { status: 200, body: { received: true, processed: true } });
  assert.deepEqual(state.rpcCalls, [{
    name: 'process_stripe_checkout_event_secure',
    args: {
      p_event_id: checkoutEvent.id,
      p_event_type: checkoutEvent.type,
      p_order_id: checkoutEvent.data.object.metadata.order_id,
      p_payment_id: checkoutEvent.data.object.payment_intent,
      p_checkout_session_id: checkoutEvent.data.object.id,
    },
  }]);
  assert.equal(state.eventInserts.length, 0);
});

test('maps an atomic RPC duplicate to an idempotent 200 response', async () => {
  const state = createHarness({ rpcResults: [{ data: 'duplicate', error: null }] });

  const result = await responseBody(await webhookHandler(requestFor()));

  assert.deepEqual(result, { status: 200, body: { received: true, duplicate: true } });
  assert.equal(state.rpcCalls.length, 1);
  assert.equal(state.eventInserts.length, 0);
});

test('two concurrent deliveries map to exactly one processed and one duplicate result', async () => {
  const state = createHarness({
    rpcResults: [
      { data: 'processed', error: null },
      { data: 'duplicate', error: null },
    ],
  });

  const responses = await Promise.all([
    webhookHandler(requestFor()),
    webhookHandler(requestFor()),
  ]);
  const results = await Promise.all(responses.map(responseBody));

  assert.deepEqual(results, [
    { status: 200, body: { received: true, processed: true } },
    { status: 200, body: { received: true, duplicate: true } },
  ]);
  assert.equal(state.rpcCalls.length, 2);
  assert.equal(state.eventInserts.length, 0);
});

test('returns 500 on atomic RPC failure without separately recording the event', async () => {
  const state = createHarness({
    rpcResults: [{ data: null, error: { code: 'payment_conflict' } }],
  });

  const result = await responseBody(await webhookHandler(requestFor()));

  assert.deepEqual(result, { status: 500, body: { error: 'Could not mark order as paid' } });
  assert.equal(state.rpcCalls.length, 1);
  assert.equal(state.eventInserts.length, 0);
});

test('fails closed when the event lookup cannot be completed', async () => {
  const state = createHarness({ lookupError: { code: 'database_error' } });

  const result = await responseBody(await webhookHandler(requestFor()));

  assert.deepEqual(result, { status: 500, body: { error: 'Webhook processing failed' } });
  assert.equal(state.orderReads, 0);
  assert.equal(state.rpcCalls.length, 0);
});

test('treats a duplicate ledger insert for an unhandled event as a no-op', async () => {
  const event = { id: 'evt_unhandled', type: 'customer.created', data: { object: {} } };
  const state = createHarness({ event, recordError: { code: '23505' } });

  const result = await responseBody(await webhookHandler(requestFor()));

  assert.deepEqual(result, {
    status: 200,
    body: { received: true, unhandled: 'customer.created' },
  });
  assert.deepEqual(state.eventInserts, [{
    event_id: 'evt_unhandled',
    event_type: 'customer.created',
  }]);
});

test('returns 500 when a non-duplicate ledger insert fails', async () => {
  const event = { id: 'evt_unhandled', type: 'customer.created', data: { object: {} } };
  const state = createHarness({ event, recordError: { code: 'database_error' } });

  const result = await responseBody(await webhookHandler(requestFor()));

  assert.deepEqual(result, { status: 500, body: { error: 'Webhook processing failed' } });
  assert.equal(state.eventInserts.length, 1);
});

test('migration makes event claim and serialized payment confirmation one transaction', () => {
  const migration = readFileSync(
    new URL('../../migrations/20260914033105_atomic_stripe_checkout_event_processing.sql', import.meta.url),
    'utf8',
  );
  const originalSchema = readFileSync(
    new URL('../../migrations/20260811040801_20260811140000_stripe_checkout_phase1.sql.sql', import.meta.url),
    'utf8',
  );

  assert.match(originalSchema, /event_id\s+text\s+PRIMARY KEY/i);
  assert.match(migration, /LANGUAGE plpgsql[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/);
  assert.match(migration, /IF p_event_id IS NULL OR btrim\(p_event_id\) = '' THEN/);
  assert.match(migration, /IF p_event_type IS NULL OR btrim\(p_event_type\) = '' THEN/);
  assert.match(migration, /IF p_order_id IS NULL THEN/);
  assert.match(migration, /IF p_payment_id IS NULL OR btrim\(p_payment_id\) = '' THEN/);
  assert.match(
    migration,
    /IF p_checkout_session_id IS NULL OR btrim\(p_checkout_session_id\) = '' THEN/,
  );
  assert.match(migration, /ON CONFLICT \(event_id\) DO NOTHING;/);
  assert.match(migration, /GET DIAGNOSTICS v_claimed_rows = ROW_COUNT;/);
  assert.match(migration, /IF v_claimed_rows = 0 THEN[\s\S]*?RETURN 'duplicate';[\s\S]*?END IF;/);
  assert.match(migration, /PERFORM public\.mark_order_paid_secure\([\s\S]*?\);[\s\S]*?RETURN 'processed';/);
  assert.doesNotMatch(migration, /EXCEPTION\s+WHEN/i);

  const claimIndex = migration.indexOf('INSERT INTO public.stripe_webhook_events');
  const duplicateIndex = migration.indexOf("RETURN 'duplicate'");
  const paymentIndex = migration.indexOf('PERFORM public.mark_order_paid_secure');
  assert.ok(claimIndex < duplicateIndex && duplicateIndex < paymentIndex);
});

test('existing payment RPC keeps order serialization, idempotency, and conflict rejection', () => {
  const migration = readFileSync(
    new URL('../../migrations/20260910204142_serialize_stripe_payment_confirmation.sql', import.meta.url),
    'utf8',
  );

  assert.match(migration, /FROM public\.orders[\s\S]*?WHERE id = p_order_id[\s\S]*?FOR UPDATE;/);
  assert.match(
    migration,
    /v_current_payment_status = 'paid'[\s\S]*?v_current_payment_id = p_payment_id[\s\S]*?v_current_session_id[\s\S]*?p_checkout_session_id[\s\S]*?RETURN;/,
  );
  assert.match(migration, /Order already paid with a different payment ID/);
  assert.match(migration, /Order already paid with a different checkout session/);
});

test('atomic RPC is executable only by service_role', () => {
  const migration = readFileSync(
    new URL('../../migrations/20260914033105_atomic_stripe_checkout_event_processing.sql', import.meta.url),
    'utf8',
  );
  const signature = /public\.process_stripe_checkout_event_secure\(text, text, uuid, text, text\)/;

  assert.match(migration, new RegExp(`REVOKE EXECUTE ON FUNCTION ${signature.source}[\\s\\S]*?FROM PUBLIC;`));
  assert.match(migration, new RegExp(`REVOKE EXECUTE ON FUNCTION ${signature.source}[\\s\\S]*?FROM anon;`));
  assert.match(migration, new RegExp(`REVOKE EXECUTE ON FUNCTION ${signature.source}[\\s\\S]*?FROM authenticated;`));
  assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION ${signature.source}[\\s\\S]*?TO service_role;`));
});
