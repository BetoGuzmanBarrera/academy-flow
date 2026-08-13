import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'https://esm.sh/@supabase/supabase-js@2') {
      return { url: 'checkout-test:supabase', shortCircuit: true };
    }
    if (specifier === 'https://esm.sh/stripe@17.3.1') {
      return { url: 'checkout-test:stripe', shortCircuit: true };
    }
    if (specifier.endsWith('/_shared/cors.ts')) {
      return { url: 'checkout-test:cors', shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === 'checkout-test:supabase') {
      return {
        format: 'module',
        source: 'export const createClient = (...args) => globalThis.__checkoutTestHooks.createClient(...args);',
        shortCircuit: true,
      };
    }
    if (url === 'checkout-test:stripe') {
      return {
        format: 'module',
        source: 'export default class Stripe { constructor(...args) { return globalThis.__checkoutTestHooks.createStripe(...args); } }',
        shortCircuit: true,
      };
    }
    if (url === 'checkout-test:cors') {
      return {
        format: 'module',
        source: `
          export const getCorsHeaders = () => ({ 'Access-Control-Allow-Origin': '*' });
          export const handleOptions = () => new Response(null, { status: 204 });
        `,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

let checkoutHandler;

globalThis.__checkoutTestHooks = {};
globalThis.Deno = {
  env: {
    get(name) {
      return {
        STRIPE_SECRET_KEY: 'sk_test_secret',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_ANON_KEY: 'anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        SITE_URL: 'https://academy.example',
      }[name];
    },
  },
  serve(handler) {
    checkoutHandler = handler;
  },
};

await import('./index.ts');

const baseOrder = {
  id: 'order-123',
  user_id: 'user-123',
  total_amount: '125.49',
  payment_status: 'pending',
  stripe_checkout_session_id: null,
};

function createHarness({
  order = baseOrder,
  authenticatedUserId = 'user-123',
  existingSessions = {},
  deferCreates = false,
  saveErrors = [],
} = {}) {
  const state = {
    order: { ...order },
    createCalls: [],
    retrieveCalls: [],
    updateCalls: [],
    resourcesCreated: 0,
  };
  const sessions = new Map(Object.entries(existingSessions));
  const idempotentCreates = new Map();
  const pendingSaveErrors = [...saveErrors];
  let releaseCreates = () => {};
  const createGate = deferCreates
    ? new Promise((resolve) => {
      releaseCreates = resolve;
    })
    : Promise.resolve();

  const userClient = {
    auth: {
      getUser: async () => ({
        data: authenticatedUserId ? { user: { id: authenticatedUserId } } : { user: null },
        error: authenticatedUserId ? null : { code: 'invalid_jwt' },
      }),
    },
  };

  const adminClient = {
    from(table) {
      assert.equal(table, 'orders');
      let operation;
      let updatePayload;
      let orderId;

      return {
        select() {
          operation = 'select';
          return this;
        },
        update(payload) {
          operation = 'update';
          updatePayload = payload;
          return this;
        },
        eq(column, value) {
          assert.equal(column, 'id');
          orderId = value;
          if (operation === 'update') {
            state.updateCalls.push({ orderId, payload: updatePayload });
            const error = pendingSaveErrors.shift() ?? null;
            if (!error && state.order.id === orderId) Object.assign(state.order, updatePayload);
            return Promise.resolve({ error });
          }
          return this;
        },
        async maybeSingle() {
          assert.equal(operation, 'select');
          return state.order.id === orderId
            ? { data: { ...state.order }, error: null }
            : { data: null, error: null };
        },
      };
    },
  };

  const stripeClient = {
    checkout: {
      sessions: {
        async retrieve(sessionId) {
          state.retrieveCalls.push(sessionId);
          const result = sessions.get(sessionId);
          if (result instanceof Error) throw result;
          if (!result) throw new Error('resource_missing');
          return { ...result };
        },
        create(params, options) {
          state.createCalls.push({ params, options });
          const key = options?.idempotencyKey;
          assert.equal(typeof key, 'string');

          if (!idempotentCreates.has(key)) {
            state.resourcesCreated += 1;
            const sequence = state.resourcesCreated;
            idempotentCreates.set(key, (async () => {
              await createGate;
              const session = {
                id: `cs_created_${sequence}`,
                status: 'open',
                url: `https://checkout.stripe.com/c/pay/created-${sequence}`,
              };
              sessions.set(session.id, session);
              return { ...session };
            })());
          }

          return idempotentCreates.get(key);
        },
      },
    },
  };

  globalThis.__checkoutTestHooks.createClient = (_url, key) =>
    key === 'anon-key' ? userClient : adminClient;
  globalThis.__checkoutTestHooks.createStripe = () => stripeClient;

  return { state, releaseCreates };
}

function requestFor(orderId = baseOrder.id) {
  return new Request('https://project.supabase.co/functions/v1/create-checkout-session', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer valid-jwt',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ orderId }),
  });
}

async function responseBody(response) {
  return { status: response.status, body: await response.json() };
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error('Timed out waiting for concurrent requests');
}

test('creates a normal session from the database amount and saves it', async () => {
  const { state } = createHarness();

  const result = await responseBody(await checkoutHandler(requestFor()));

  assert.deepEqual(result, {
    status: 200,
    body: { sessionUrl: 'https://checkout.stripe.com/c/pay/created-1' },
  });
  assert.equal(state.resourcesCreated, 1);
  assert.equal(state.createCalls[0].params.line_items[0].price_data.unit_amount, 12549);
  assert.equal(
    state.createCalls[0].options.idempotencyKey,
    'checkout-session:order-123:initial',
  );
  assert.equal(state.order.stripe_checkout_session_id, 'cs_created_1');
});

test('two concurrent attempts for the same order resolve to one Stripe session', async () => {
  const { state, releaseCreates } = createHarness({ deferCreates: true });

  const first = checkoutHandler(requestFor());
  const second = checkoutHandler(requestFor());
  await waitFor(() => state.createCalls.length === 2);
  releaseCreates();

  const results = await Promise.all([first, second].map(async (response) =>
    responseBody(await response)));

  assert.equal(state.resourcesCreated, 1);
  assert.equal(new Set(state.createCalls.map((call) => call.options.idempotencyKey)).size, 1);
  assert.deepEqual(results, [
    { status: 200, body: { sessionUrl: 'https://checkout.stripe.com/c/pay/created-1' } },
    { status: 200, body: { sessionUrl: 'https://checkout.stripe.com/c/pay/created-1' } },
  ]);
  assert.equal(state.order.stripe_checkout_session_id, 'cs_created_1');
});

test('reuses an existing open session with a valid HTTPS URL', async () => {
  const { state } = createHarness({
    order: { ...baseOrder, stripe_checkout_session_id: 'cs_open' },
    existingSessions: {
      cs_open: {
        id: 'cs_open',
        status: 'open',
        url: 'https://checkout.stripe.com/c/pay/existing',
      },
    },
  });

  const result = await responseBody(await checkoutHandler(requestFor()));

  assert.deepEqual(result, {
    status: 200,
    body: { sessionUrl: 'https://checkout.stripe.com/c/pay/existing' },
  });
  assert.equal(state.createCalls.length, 0);
  assert.equal(state.updateCalls.length, 0);
});

test('replaces a confirmed expired session exactly once', async () => {
  const { state } = createHarness({
    order: { ...baseOrder, stripe_checkout_session_id: 'cs_expired' },
    existingSessions: {
      cs_expired: {
        id: 'cs_expired',
        status: 'expired',
        url: null,
      },
    },
  });

  const result = await responseBody(await checkoutHandler(requestFor()));

  assert.deepEqual(result, {
    status: 200,
    body: { sessionUrl: 'https://checkout.stripe.com/c/pay/created-1' },
  });
  assert.equal(state.resourcesCreated, 1);
  assert.equal(state.createCalls.length, 1);
  assert.equal(
    state.createCalls[0].options.idempotencyKey,
    'checkout-session:order-123:cs_expired',
  );
  assert.equal(state.order.stripe_checkout_session_id, 'cs_created_1');
});

test('does not replace a complete session while payment is being confirmed', async () => {
  const { state } = createHarness({
    order: { ...baseOrder, stripe_checkout_session_id: 'cs_complete' },
    existingSessions: {
      cs_complete: {
        id: 'cs_complete',
        status: 'complete',
        url: null,
      },
    },
  });

  const result = await responseBody(await checkoutHandler(requestFor()));

  assert.deepEqual(result, {
    status: 409,
    body: { error: 'Payment is being confirmed. Try again shortly.' },
  });
  assert.equal(state.createCalls.length, 0);
  assert.equal(state.resourcesCreated, 0);
  assert.equal(state.updateCalls.length, 0);
});

test('does not replace a session when retrieval fails', async () => {
  const { state } = createHarness({
    order: { ...baseOrder, stripe_checkout_session_id: 'cs_unknown' },
    existingSessions: { cs_unknown: new Error('network_error') },
  });

  const result = await responseBody(await checkoutHandler(requestFor()));

  assert.deepEqual(result, {
    status: 503,
    body: { error: 'Payment session is temporarily unavailable. Try again.' },
  });
  assert.equal(state.createCalls.length, 0);
  assert.equal(state.resourcesCreated, 0);
  assert.equal(state.updateCalls.length, 0);
});

test('does not replace an open session without a valid URL', async () => {
  const { state } = createHarness({
    order: { ...baseOrder, stripe_checkout_session_id: 'cs_open_without_url' },
    existingSessions: {
      cs_open_without_url: {
        id: 'cs_open_without_url',
        status: 'open',
        url: null,
      },
    },
  });

  const result = await responseBody(await checkoutHandler(requestFor()));

  assert.deepEqual(result, {
    status: 503,
    body: { error: 'Payment session is temporarily unavailable. Try again.' },
  });
  assert.equal(state.createCalls.length, 0);
  assert.equal(state.resourcesCreated, 0);
  assert.equal(state.updateCalls.length, 0);
});

test('does not return the Checkout URL when saving the session ID fails', async () => {
  const { state } = createHarness({ saveErrors: [{ code: 'database_error' }] });

  const result = await responseBody(await checkoutHandler(requestFor()));

  assert.deepEqual(result, {
    status: 500,
    body: { error: 'Could not start payment session. Try again.' },
  });
  assert.equal('sessionUrl' in result.body, false);
  assert.equal(state.resourcesCreated, 1);
  assert.equal(state.updateCalls.length, 1);
  assert.equal(state.order.stripe_checkout_session_id, null);
});

test('retry after a save failure uses the same idempotency key and session', async () => {
  const { state } = createHarness({ saveErrors: [{ code: 'database_error' }] });

  const firstResult = await responseBody(await checkoutHandler(requestFor()));
  const retryResult = await responseBody(await checkoutHandler(requestFor()));

  assert.equal(firstResult.status, 500);
  assert.equal('sessionUrl' in firstResult.body, false);
  assert.deepEqual(retryResult, {
    status: 200,
    body: { sessionUrl: 'https://checkout.stripe.com/c/pay/created-1' },
  });
  assert.equal(state.createCalls.length, 2);
  assert.equal(state.resourcesCreated, 1);
  assert.deepEqual(
    state.createCalls.map((call) => call.options.idempotencyKey),
    ['checkout-session:order-123:initial', 'checkout-session:order-123:initial'],
  );
  assert.equal(state.order.stripe_checkout_session_id, 'cs_created_1');
});

test('rejects an already paid order before contacting Stripe', async () => {
  const { state } = createHarness({
    order: { ...baseOrder, payment_status: 'paid' },
  });

  const result = await responseBody(await checkoutHandler(requestFor()));

  assert.equal(result.status, 409);
  assert.equal(result.body.error, 'This order cannot be paid in its current state');
  assert.equal(state.createCalls.length, 0);
  assert.equal(state.retrieveCalls.length, 0);
});

test('hides an order that belongs to another user', async () => {
  const { state } = createHarness({
    order: { ...baseOrder, user_id: 'different-user' },
  });

  const result = await responseBody(await checkoutHandler(requestFor()));

  assert.equal(result.status, 404);
  assert.equal(result.body.error, 'Order not found');
  assert.equal(state.createCalls.length, 0);
  assert.equal(state.retrieveCalls.length, 0);
});

test('preserves the MXN 10 minimum before contacting Stripe', async () => {
  const { state } = createHarness({
    order: { ...baseOrder, total_amount: '9.99' },
  });

  const result = await responseBody(await checkoutHandler(requestFor()));

  assert.equal(result.status, 400);
  assert.equal(state.createCalls.length, 0);
});
