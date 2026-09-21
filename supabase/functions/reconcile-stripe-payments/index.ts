import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@17.3.1';
import { createAcademyCheckoutSession } from '../_shared/checkoutSession.ts';

type AdminClient = ReturnType<typeof createClient>;
type SessionJob = {
  id: string; order_id: string; user_id: string; idempotency_key: string;
  checkout_session_id: string | null; expected_amount: number;
  site_url: string; lease_token: string; attempt_count: number;
  created_at: string;
};
type RefundJob = {
  id: string; order_id: string; checkout_session_id: string;
  payment_intent_id: string; expected_amount: number; currency: string;
  lease_token: string; attempt_count: number;
};
type RefundAttempt = {
  id: string; attempt_number: number; amount: number;
  idempotency_key: string; state: string; created_at: string;
  stripe_refund_id: string | null;
};

async function tokenMatches(received: string | null, expected: string): Promise<boolean> {
  if (!received || !expected) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(received)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let difference = received.length ^ expected.length;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

function nextAttempt(attemptCount: number): string {
  const minutes = Math.min(60, 2 ** Math.min(attemptCount, 6));
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function updateSession(
  db: AdminClient, job: SessionJob,
  patch: Record<string, string | number | null>,
): Promise<void> {
  const { data, error } = await db.from('stripe_checkout_reconciliation')
    .update({ ...patch, lease_token: null, lease_until: null,
      updated_at: new Date().toISOString() })
    .eq('id', job.id).eq('lease_token', job.lease_token)
    .select('id').maybeSingle();
  if (error || !data) throw new Error('Failed to persist session reconciliation');
}

async function updateRefund(
  db: AdminClient, job: RefundJob,
  patch: Record<string, string | number | null>,
): Promise<void> {
  const { data, error } = await db.from('stripe_refund_obligations')
    .update({ ...patch, lease_token: null, lease_until: null,
      updated_at: new Date().toISOString() })
    .eq('id', job.id).eq('lease_token', job.lease_token)
    .select('id').maybeSingle();
  if (error || !data) throw new Error('Failed to persist refund reconciliation');
}

async function finishSession(
  db: AdminClient, job: SessionJob, sessionId: string,
): Promise<void> {
  const { error } = await db.rpc('complete_stripe_session_reconciliation_secure', {
    p_job_id: job.id, p_lease_token: job.lease_token, p_session_id: sessionId,
  });
  if (error) throw new Error('Failed to complete session reconciliation');
}

async function processSession(
  db: AdminClient, stripe: Stripe, job: SessionJob,
): Promise<void> {
  try {
    let session: Stripe.Checkout.Session;
    if (job.checkout_session_id) {
      session = await stripe.checkout.sessions.retrieve(job.checkout_session_id);
    } else {
      // Stripe may discard idempotency keys after 24h. Never generate a new
      // Checkout Session automatically when the original result is ambiguous.
      if (Date.now() - new Date(job.created_at).getTime() >= 23 * 60 * 60_000) {
        await updateSession(db, job, { state: 'manual_review', last_error: 'ambiguous_session_creation' });
        return;
      }
      session = await createAcademyCheckoutSession(
        stripe, job.order_id, job.user_id, job.expected_amount,
        job.site_url, job.idempotency_key,
      );
    }

    if (session.status === 'open') {
      await stripe.checkout.sessions.expire(session.id);
      await finishSession(db, job, session.id);
      return;
    }
    if (session.status === 'expired') {
      await finishSession(db, job, session.id);
      return;
    }
    if (session.status === 'complete' && session.payment_status === 'paid') {
      const paymentIntentId = typeof session.payment_intent === 'string'
        ? session.payment_intent : session.payment_intent?.id;
      if (!paymentIntentId || session.currency !== 'mxn'
          || session.amount_total !== job.expected_amount) {
        await updateSession(db, job, { state: 'manual_review', last_error: 'payment_mismatch' });
        return;
      }
      const { error } = await db.rpc('queue_stripe_refund_secure', {
        p_order_id: job.order_id,
        p_checkout_session_id: session.id,
        p_payment_id: paymentIntentId,
        p_amount: job.expected_amount,
        p_currency: session.currency,
      });
      if (error) throw new Error('Failed to queue paid session refund');
      await finishSession(db, job, session.id);
      return;
    }

    // A completed but unpaid asynchronous method may still succeed later.
    await updateSession(db, job, {
      state: 'reconcile', next_attempt_at: nextAttempt(job.attempt_count),
      last_error: 'awaiting_payment_result',
    });
  } catch {
    await updateSession(db, job, {
      state: 'reconcile', next_attempt_at: nextAttempt(job.attempt_count),
      last_error: 'stripe_or_database_retry',
    });
  }
}

async function listRefunds(stripe: Stripe, paymentIntentId: string): Promise<Stripe.Refund[]> {
  const refunds: Stripe.Refund[] = [];
  for await (const refund of stripe.refunds.list({
    payment_intent: paymentIntentId, limit: 100,
  })) refunds.push(refund);
  return refunds;
}

async function processRefund(
  db: AdminClient, stripe: Stripe, job: RefundJob,
): Promise<void> {
  try {
    const intent = await stripe.paymentIntents.retrieve(job.payment_intent_id);
    if (intent.status !== 'succeeded' || intent.currency !== job.currency
        || intent.amount_received !== job.expected_amount) {
      await updateRefund(db, job, {
        state: 'manual_review', last_error: 'payment_intent_mismatch',
      });
      return;
    }

    const refunds = await listRefunds(stripe, job.payment_intent_id);
    const successful = refunds.filter((refund) => refund.status === 'succeeded');
    const succeededAmount = successful.reduce((sum, refund) => sum + refund.amount, 0);
    const { data: previous, error: previousError } = await db
      .from('stripe_refund_attempts').select('*')
      .eq('obligation_id', job.id)
      .order('attempt_number', { ascending: false }).limit(1).maybeSingle();
    if (previousError) throw new Error('Failed to load refund attempt');

    let attempt = previous as RefundAttempt | null;
    const knownRefund = attempt && refunds.find((refund) =>
      refund.id === attempt.stripe_refund_id
      || (refund.metadata?.attempt_id === attempt.id
        && refund.metadata?.obligation_id === job.id));
    if (knownRefund) {
      if (knownRefund.amount !== attempt?.amount
          || (attempt?.stripe_refund_id
            && attempt.stripe_refund_id !== knownRefund.id)) {
        await updateRefund(db, job, {
          state: 'manual_review', last_error: 'refund_amount_changed',
        });
        return;
      }
      const state = knownRefund.status === 'failed' || knownRefund.status === 'canceled'
        ? 'failed' : knownRefund.status === 'succeeded' ? 'succeeded' : 'pending';
      const { error } = await db.from('stripe_refund_attempts').update({
        stripe_refund_id: knownRefund.id, state,
        updated_at: new Date().toISOString(),
      }).eq('id', attempt!.id);
      if (error) throw new Error('Failed to persist observed refund status');
      attempt = { ...attempt!, state, stripe_refund_id: knownRefund.id };
    }

    if (succeededAmount >= job.expected_amount) {
      const { error } = await db.rpc('confirm_stripe_refund_secure', {
        p_obligation_id: job.id,
        p_refund_id: successful.at(-1)?.id ?? null,
      });
      if (error) throw new Error('Failed to confirm full refund');
      return;
    }
    if (refunds.some((refund) =>
      refund.status === 'pending' || refund.status === 'requires_action')) {
      await updateRefund(db, job, {
        next_attempt_at: nextAttempt(job.attempt_count),
        last_error: 'refund_pending',
      });
      return;
    }

    if (attempt && attempt.state === 'succeeded' && !knownRefund) {
      await updateRefund(db, job, {
        state: 'manual_review', last_error: 'missing_succeeded_refund',
      });
      return;
    }
    if (attempt && attempt.state !== 'failed' && attempt.state !== 'succeeded') {
      if (attempt.amount > job.expected_amount - succeededAmount) {
        await updateRefund(db, job, {
          state: 'manual_review', last_error: 'refund_amount_changed',
        });
        return;
      }
      // A prior timeout is an unknown result. Keep the same key while Stripe
      // retains it; after that, require human reconciliation.
      if (Date.now() - new Date(attempt.created_at).getTime() >= 23 * 60 * 60_000) {
        await updateRefund(db, job, {
          state: 'manual_review', last_error: 'ambiguous_refund_result',
        });
        return;
      }
    } else {
      const attemptNumber = (attempt?.attempt_number ?? 0) + 1;
      const remaining = job.expected_amount - succeededAmount;
      const { data, error } = await db.from('stripe_refund_attempts')
        .insert({
          obligation_id: job.id, attempt_number: attemptNumber,
          amount: remaining,
          idempotency_key: `cancel-refund:${job.id}:${attemptNumber}`,
        }).select('*').single();
      if (error || !data) throw new Error('Failed to persist refund attempt');
      attempt = data as RefundAttempt;
    }

    if (!attempt) throw new Error('Refund attempt missing');
    // The attempt row commits before this external request. Every retry uses
    // its original amount and idempotency key.
    const refund = await stripe.refunds.create({
      payment_intent: job.payment_intent_id,
      amount: attempt.amount,
      metadata: { obligation_id: job.id, attempt_id: attempt.id },
    }, { idempotencyKey: attempt.idempotency_key });

    const { error: attemptError } = await db.from('stripe_refund_attempts')
      .update({
        stripe_refund_id: refund.id,
        state: refund.status === 'succeeded' ? 'succeeded'
          : refund.status === 'failed' || refund.status === 'canceled' ? 'failed'
          : 'pending',
        updated_at: new Date().toISOString(),
      }).eq('id', attempt.id);
    if (attemptError) throw new Error('Failed to persist Stripe refund result');

    if (refund.status === 'succeeded'
        && succeededAmount + refund.amount >= job.expected_amount) {
      const { error } = await db.rpc('confirm_stripe_refund_secure', {
        p_obligation_id: job.id, p_refund_id: refund.id,
      });
      if (error) throw new Error('Failed to confirm full refund');
    } else {
      await updateRefund(db, job, {
        next_attempt_at: nextAttempt(job.attempt_count),
        last_error: refund.status === 'failed' || refund.status === 'canceled'
          ? 'refund_failed_retry' : 'refund_pending',
      });
    }
  } catch {
    await updateRefund(db, job, {
      next_attempt_at: nextAttempt(job.attempt_count),
      last_error: 'stripe_or_database_retry',
    });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  const expected = Deno.env.get('STRIPE_RECONCILER_TOKEN');
  if (!expected) return new Response(null, { status: 503 });
  if (!(await tokenMatches(req.headers.get('X-Reconciler-Token'), expected))) {
    return new Response(null, { status: 401 });
  }

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!stripeKey || !supabaseUrl || !serviceRoleKey) {
    return new Response(null, { status: 503 });
  }

  try {
    const db = createClient(supabaseUrl, serviceRoleKey,
      { auth: { persistSession: false } });
    const stripe = new Stripe(stripeKey,
      { apiVersion: '2025-08-27.basil' as Stripe.LatestApiVersion });

    for (let i = 0; i < 5; i++) {
      const { data, error } = await db.rpc('claim_stripe_session_reconciliation_secure');
      if (error) throw new Error('Failed to claim session work');
      const job = (data as SessionJob[] | null)?.[0];
      if (!job) break;
      await processSession(db, stripe, job);
    }
    for (let i = 0; i < 5; i++) {
      const { data, error } = await db.rpc('claim_stripe_refund_reconciliation_secure');
      if (error) throw new Error('Failed to claim refund work');
      const job = (data as RefundJob[] | null)?.[0];
      if (!job) break;
      await processRefund(db, stripe, job);
    }
    return Response.json({ accepted: true });
  } catch {
    console.error('Stripe reconciliation invocation failed');
    return Response.json({ error: 'Reconciliation unavailable' }, { status: 500 });
  }
});
