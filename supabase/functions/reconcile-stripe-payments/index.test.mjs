import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'https://esm.sh/@supabase/supabase-js@2') {
      return { url: 'reconciler-test:supabase', shortCircuit: true };
    }
    if (specifier === 'https://esm.sh/stripe@17.3.1') {
      return { url: 'reconciler-test:stripe', shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === 'reconciler-test:supabase') return {
      format: 'module', shortCircuit: true,
      source: 'export const createClient = () => globalThis.__reconcilerTest.db;',
    };
    if (url === 'reconciler-test:stripe') return {
      format: 'module', shortCircuit: true,
      source: 'export default class Stripe { constructor() { return globalThis.__reconcilerTest.stripe; } }',
    };
    return nextLoad(url, context);
  },
});

let handler;
globalThis.__reconcilerTest = {};
globalThis.Deno = {
  env: { get(name) { return {
    STRIPE_RECONCILER_TOKEN: 'test-only-worker-token',
    STRIPE_SECRET_KEY: 'test-only-stripe-key',
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-role',
  }[name]; } },
  serve(callback) { handler = callback; },
};
await import('./index.ts?reconciler-test');

function harness({ sessionJob = null, refundJob = null, session = null,
  intent = null, refunds = [], createRefundError = null,
  priorAttempts = [], createdRefundStatus = 'succeeded' } = {}) {
  const state = {
    sessionClaims: 0, refundClaims: 0, sessionUpdates: [], refundUpdates: [],
    sessionExpires: [], refundCreates: [], refundAttempts: priorAttempts.map((row) => ({ ...row })),
    rpcCalls: [],
  };
  const jobSession = sessionJob && { ...sessionJob };
  const jobRefund = refundJob && { ...refundJob };
  const rowFor = (table) => ({
    stripe_checkout_reconciliation: jobSession,
    stripe_refund_obligations: jobRefund,
  })[table];
  const db = {
    async rpc(name, args) {
      state.rpcCalls.push({ name, args });
      if (name === 'claim_stripe_session_reconciliation_secure') {
        state.sessionClaims += 1;
        return { data: state.sessionClaims === 1 && jobSession ? [jobSession] : [], error: null };
      }
      if (name === 'claim_stripe_refund_reconciliation_secure') {
        state.refundClaims += 1;
        return { data: state.refundClaims === 1 && jobRefund ? [jobRefund] : [], error: null };
      }
      return { data: null, error: null };
    },
    from(table) {
      let operation = 'select';
      let patch = null;
      const filters = [];
      const query = {
        select() { return query; },
        eq(column, value) { filters.push([column, value]); return query; },
        order() { return query; },
        limit() { return query; },
        update(value) { operation = 'update'; patch = value; return query; },
        insert(value) { operation = 'insert'; patch = value; return query; },
        async maybeSingle() { return finish(); },
        async single() { return finish(); },
        then(resolve, reject) { return Promise.resolve(finish()).then(resolve, reject); },
      };
      function finish() {
        if (operation === 'insert' && table === 'stripe_refund_attempts') {
          const attempt = { id: `attempt-${state.refundAttempts.length + 1}`,
            state: 'prepared', created_at: new Date().toISOString(),
            stripe_refund_id: null, ...patch };
          state.refundAttempts.push(attempt);
          return { data: attempt, error: null };
        }
        if (operation === 'update' && table === 'stripe_refund_attempts') {
          Object.assign(state.refundAttempts.find((item) =>
            item.id === filters.find(([field]) => field === 'id')?.[1]), patch);
          return { data: null, error: null };
        }
        const row = rowFor(table);
        if (operation === 'update') {
          assert.ok(row, `unexpected ${table} update`);
          assert.equal(filters.find(([field]) => field === 'lease_token')?.[1], row.lease_token);
          if (table === 'stripe_checkout_reconciliation') state.sessionUpdates.push(patch);
          else state.refundUpdates.push(patch);
          Object.assign(row, patch);
          return { data: { id: row.id }, error: null };
        }
        if (table === 'stripe_refund_attempts') {
          return { data: state.refundAttempts.at(-1) ?? null, error: null };
        }
        if (table === 'stripe_checkout_reconciliation') {
          const id = filters.find(([field]) => field === 'checkout_session_id')?.[1];
          return { data: row?.checkout_session_id === id ? { id: row.id } : null,
            error: null };
        }
        throw new Error(`unexpected query ${table}`);
      }
      return query;
    },
  };
  const stripe = {
    checkout: { sessions: {
      async retrieve() { return session; },
      async expire(id) { state.sessionExpires.push(id); return { id, status: 'expired' }; },
      async create() { return session; },
    } },
    paymentIntents: { async retrieve() { return intent; } },
    refunds: {
      async *list() { for (const refund of refunds) yield refund; },
      async create(payload, options) {
        state.refundCreates.push({ payload, options });
        if (createRefundError) throw createRefundError;
        return { id: 're_new', amount: payload.amount, status: createdRefundStatus };
      },
    },
  };
  globalThis.__reconcilerTest = { db, stripe };
  return state;
}

function request(token = 'test-only-worker-token') {
  return new Request('https://project.supabase.co/functions/v1/reconcile-stripe-payments', {
    method: 'POST', headers: { 'X-Reconciler-Token': token },
  });
}

const baseSessionJob = {
  id: 'job-session', order_id: 'order-1', user_id: 'user-1',
  idempotency_key: 'checkout-session:order-1:initial',
  checkout_session_id: 'cs_1', expected_amount: 12549,
  site_url: 'https://academy.example', lease_token: 'lease-1',
  attempt_count: 1, created_at: new Date().toISOString(),
};
const baseRefundJob = {
  id: 'job-refund', order_id: 'order-1', checkout_session_id: 'cs_1',
  payment_intent_id: 'pi_1', expected_amount: 12549, currency: 'mxn',
  lease_token: 'lease-2', attempt_count: 1,
};
const paidIntent = { status: 'succeeded', currency: 'mxn', amount_received: 12549 };

test('worker refuses an invalid token before database and Stripe access', async () => {
  const state = harness();
  const response = await handler(request('wrong-token'));
  assert.equal(response.status, 401);
  assert.equal(state.rpcCalls.length, 0);
});

test('an open cancelled-order session is expired and durably completed', async () => {
  const state = harness({ sessionJob: baseSessionJob,
    session: { id: 'cs_1', status: 'open' } });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(state.sessionExpires, ['cs_1']);
  assert.equal(state.rpcCalls.filter((call) =>
    call.name === 'complete_stripe_session_reconciliation_secure').length, 1);
  assert.equal(state.refundCreates.length, 0);
});

test('a paid session queues durable refund work instead of expiring', async () => {
  const state = harness({ sessionJob: baseSessionJob,
    session: { id: 'cs_1', status: 'complete', payment_status: 'paid',
      payment_intent: 'pi_1', currency: 'mxn', amount_total: 12549 } });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(state.rpcCalls.filter((call) =>
    call.name === 'queue_stripe_refund_secure').length, 1);
  assert.equal(state.rpcCalls.filter((call) =>
    call.name === 'complete_stripe_session_reconciliation_secure').length, 1);
});

const oldAttempt = (state = 'pending') => ({
  id: 'attempt-1', obligation_id: baseRefundJob.id, attempt_number: 1,
  amount: 12549, idempotency_key: 'cancel-refund:job-refund:1',
  stripe_refund_id: 're_old', state,
  created_at: new Date().toISOString(),
});
const listedOldRefund = (status, amount = 12549) => ({
  id: 're_old', amount, status,
  metadata: { attempt_id: 'attempt-1', obligation_id: baseRefundJob.id },
});

test('a pending Stripe refund remains pending without another create', async () => {
  const state = harness({ refundJob: baseRefundJob, intent: paidIntent,
    priorAttempts: [oldAttempt('pending')], refunds: [listedOldRefund('pending')] });
  assert.equal((await handler(request())).status, 200);
  assert.equal(state.refundCreates.length, 0);
  assert.equal(state.refundAttempts[0].state, 'pending');
});

for (const status of ['failed', 'canceled']) {
  test(`a previously pending refund now ${status} gets a new attempt and key`, async () => {
    const state = harness({ refundJob: baseRefundJob, intent: paidIntent,
      priorAttempts: [oldAttempt('pending')], refunds: [listedOldRefund(status)] });
    assert.equal((await handler(request())).status, 200);
    assert.equal(state.refundAttempts[0].state, 'failed');
    assert.equal(state.refundAttempts[1].attempt_number, 2);
    assert.equal(state.refundCreates[0].payload.amount, 12549);
    assert.equal(state.refundCreates[0].options.idempotencyKey,
      'cancel-refund:job-refund:2');
  });
}

test('a previously pending refund now succeeded confirms without another create', async () => {
  const state = harness({ refundJob: baseRefundJob, intent: paidIntent,
    priorAttempts: [oldAttempt('pending')], refunds: [listedOldRefund('succeeded')] });
  assert.equal((await handler(request())).status, 200);
  assert.equal(state.refundAttempts[0].state, 'succeeded');
  assert.equal(state.refundCreates.length, 0);
  assert.equal(state.rpcCalls.filter((call) =>
    call.name === 'confirm_stripe_refund_secure').length, 1);
});

test('a partial success and failed remainder retry only the remaining amount', async () => {
  const state = harness({ refundJob: baseRefundJob, intent: paidIntent,
    priorAttempts: [{ ...oldAttempt('pending'), amount: 7549 }],
    refunds: [
      { id: 're_partial', amount: 5000, status: 'succeeded' },
      listedOldRefund('failed', 7549),
    ] });
  assert.equal((await handler(request())).status, 200);
  assert.equal(state.refundAttempts[0].state, 'failed');
  assert.equal(state.refundCreates[0].payload.amount, 7549);
  assert.equal(state.refundCreates[0].options.idempotencyKey,
    'cancel-refund:job-refund:2');
});

test('an ambiguous prior timeout keeps its original idempotency key', async () => {
  const state = harness({ refundJob: baseRefundJob, intent: paidIntent,
    priorAttempts: [{ ...oldAttempt('ambiguous'), stripe_refund_id: null }],
    createRefundError: new Error('timeout') });
  assert.equal((await handler(request())).status, 200);
  assert.equal(state.refundAttempts.length, 1);
  assert.equal(state.refundCreates[0].options.idempotencyKey,
    'cancel-refund:job-refund:1');
});

test('a reclaimed refund lease reuses the durable attempt key after a timeout', async () => {
  const state = harness({ refundJob: baseRefundJob, intent: paidIntent,
    createRefundError: new Error('timeout') });
  assert.equal((await handler(request())).status, 200);
  state.refundClaims = 0;
  assert.equal((await handler(request())).status, 200);
  assert.equal(state.refundAttempts.length, 1);
  assert.deepEqual(state.refundCreates.map((call) => call.options.idempotencyKey), [
    'cancel-refund:job-refund:1', 'cancel-refund:job-refund:1',
  ]);
});

test('refund metadata identifies the durable attempt when its Stripe ID was not stored', async () => {
  const state = harness({ refundJob: baseRefundJob, intent: paidIntent,
    priorAttempts: [{ ...oldAttempt('pending'), stripe_refund_id: null }],
    refunds: [listedOldRefund('failed')] });
  assert.equal((await handler(request())).status, 200);
  assert.equal(state.refundAttempts[0].stripe_refund_id, 're_old');
  assert.equal(state.refundAttempts[0].state, 'failed');
  assert.equal(state.refundCreates[0].options.idempotencyKey,
    'cancel-refund:job-refund:2');
});

test('an old ambiguous result stops for manual review instead of changing keys', async () => {
  const state = harness({ refundJob: baseRefundJob, intent: paidIntent,
    priorAttempts: [{ ...oldAttempt('ambiguous'), stripe_refund_id: null,
      created_at: new Date(Date.now() - 24 * 60 * 60_000).toISOString() }] });
  assert.equal((await handler(request())).status, 200);
  assert.equal(state.refundCreates.length, 0);
  assert.equal(state.refundUpdates.at(-1).state, 'manual_review');
});

test('SQL finalizes only after all known sessions and refunds are done', () => {
  const sql = readFileSync(new URL('../../migrations/20260920202400_stripe_financial_reconciliation.sql',
    import.meta.url), 'utf8');
  assert.match(sql, /CREATE FUNCTION academy_internal\.maybe_finalize_cancelled_order_refund_secure/);
  assert.match(sql, /v_order\.status <> 'cancelled'/);
  assert.match(sql, /WHERE order_id = p_order_id AND state IS DISTINCT FROM 'confirmed'/);
  assert.match(sql, /WHERE order_id = p_order_id AND state IS DISTINCT FROM 'done'/);
  assert.match(sql, /CREATE FUNCTION public\.complete_stripe_session_reconciliation_secure/);
  assert.match(sql, /v_job\.lease_token IS DISTINCT FROM p_lease_token/);
  assert.match(sql, /state = 'done', last_error = NULL,[\s\S]*?PERFORM academy_internal\.maybe_finalize_cancelled_order_refund_secure\(v_order_id\)/);
  assert.match(sql, /IF v_order\.payment_status = 'refunded' AND v_new_obligation = 1 THEN/);
  const queue = sql.split('CREATE FUNCTION public.queue_stripe_refund_secure(')[1]
    .split('$$;')[0];
  assert.match(queue, /ON CONFLICT \(payment_intent_id\) DO NOTHING;\s+GET DIAGNOSTICS v_new_obligation = ROW_COUNT;/);
  assert.doesNotMatch(queue, /SET state = 'done'/);
  const webhook = sql.split('CREATE FUNCTION public.process_stripe_checkout_event_secure(')[1]
    .split('$$;')[0];
  assert.match(webhook, /IF v_order\.payment_status = 'refunded' AND v_new_obligation = 1 THEN/);
  assert.match(sql, /FOR UPDATE OF candidate SKIP LOCKED LIMIT 1/);
  assert.match(sql, /UNIQUE \(obligation_id, attempt_number\)/);
});

test('an existing partial refund reduces the next amount to the remainder', async () => {
  const state = harness({ refundJob: baseRefundJob, intent: paidIntent,
    refunds: [{ id: 're_partial', amount: 5000, status: 'succeeded' }] });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(state.refundAttempts[0].amount, 7549);
  assert.equal(state.refundCreates[0].payload.amount, 7549);
  assert.equal(state.rpcCalls.filter((call) =>
    call.name === 'confirm_stripe_refund_secure').length, 1);
});

test('Stripe timeout leaves the same durable attempt for retry', async () => {
  const state = harness({ refundJob: baseRefundJob, intent: paidIntent,
    createRefundError: new Error('timeout') });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(state.refundCreates.length, 1);
  assert.equal(state.refundAttempts.length, 1);
  assert.equal(state.refundUpdates.at(-1).state, undefined);
  assert.equal(state.refundUpdates.at(-1).last_error, 'stripe_or_database_retry');
});
