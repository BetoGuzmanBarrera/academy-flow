import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  getOrderProcessingBlockReason,
  requiresOrderCancellationConfirmation,
  runOrderCancellationOnce,
} from '../src/lib/adminOrderCancellation.ts';

const adminSource = readFileSync(new URL('../src/pages/Admin.tsx', import.meta.url), 'utf8');
const paymentGuardMigration = readFileSync(
  new URL(
    '../supabase/migrations/20260915052101_block_unpaid_order_processing.sql',
    import.meta.url,
  ),
  'utf8',
);

test('only cancelled transitions require the destructive confirmation', () => {
  assert.equal(requiresOrderCancellationConfirmation('cancelled'), true);
  assert.equal(requiresOrderCancellationConfirmation('pending'), false);
  assert.equal(requiresOrderCancellationConfirmation('in_progress'), false);
  assert.equal(requiresOrderCancellationConfirmation('completed'), false);

  assert.match(
    adminSource,
    /if \(requiresOrderCancellationConfirmation\(status\)\) \{[\s\S]*?setPendingCancellationOrder\(order\);[\s\S]*?return;[\s\S]*?\}/,
  );
});

test('unpaid pending orders are blocked using the current server payment state', () => {
  const expectedMessage = 'No puedes iniciar esta orden porque el pago aún no está confirmado.';

  assert.equal(getOrderProcessingBlockReason('pending', 'in_progress', 'pending'), expectedMessage);
  assert.equal(getOrderProcessingBlockReason('pending', 'in_progress', 'failed'), expectedMessage);
  assert.equal(getOrderProcessingBlockReason('pending', 'in_progress', 'refunded'), expectedMessage);
  assert.equal(getOrderProcessingBlockReason('pending', 'in_progress', 'paid'), null);
  assert.equal(getOrderProcessingBlockReason('pending', 'cancelled', 'pending'), null);
  assert.equal(getOrderProcessingBlockReason('completed', 'in_progress', 'pending'), null);

  const selectionHandler = adminSource.slice(
    adminSource.indexOf('const handleOrderStatusSelection'),
    adminSource.indexOf('const handleConfirmOrderCancellation'),
  );
  const guardIndex = selectionHandler.indexOf('getOrderProcessingBlockReason');
  const requestIndex = selectionHandler.indexOf('performOrderStatusChange');

  assert.ok(guardIndex >= 0);
  assert.ok(requestIndex > guardIndex);
  assert.match(
    selectionHandler,
    /\.from\('orders'\)\s*\.select\('status, payment_status'\)\s*\.eq\('id', order\.id\)\s*\.single\(\)/,
  );
  assert.match(selectionHandler, /currentOrder\.status/);
  assert.match(selectionHandler, /currentOrder\.payment_status/);
  assert.doesNotMatch(selectionHandler, /status,\s*order\.payment_status/);
  assert.match(
    selectionHandler,
    /if \(processingBlockReason\) \{\s*setError\(processingBlockReason\);\s*setSavingId\(null\);\s*return;/,
  );
});

test('the authoritative RPC rejects unpaid pending-to-in-progress transitions under the order lock', () => {
  const lockIndex = paymentGuardMigration.indexOf('FOR NO KEY UPDATE');
  const paymentGuardIndex = paymentGuardMigration.indexOf(
    "v_payment_status IS DISTINCT FROM 'paid'",
  );
  const processingUpdateIndex = paymentGuardMigration.indexOf(
    "ELSIF p_new_status = 'in_progress' AND v_current_status = 'pending'",
  );

  assert.ok(lockIndex >= 0);
  assert.ok(paymentGuardIndex > lockIndex);
  assert.ok(processingUpdateIndex > paymentGuardIndex);
  assert.match(
    paymentGuardMigration,
    /v_current_status = 'pending'[\s\S]*?p_new_status = 'in_progress'[\s\S]*?v_payment_status IS DISTINCT FROM 'paid'[\s\S]*?RAISE EXCEPTION 'Order must be paid before processing';/,
  );
  assert.match(
    paymentGuardMigration,
    /CREATE OR REPLACE FUNCTION public\.transition_order_secure\(\s*p_order_id uuid,\s*p_admin_id uuid,\s*p_new_status text\s*\)/,
  );
  assert.doesNotMatch(paymentGuardMigration, /p_payment_status/);
});

test('the migration preserves lifecycle branches, credential safeguards, and RPC grants', () => {
  assert.match(paymentGuardMigration, /p_new_status = 'completed' AND v_payment_status != 'paid'/);
  assert.match(paymentGuardMigration, /v_current_status = 'completed' AND p_new_status = 'in_progress'/);
  assert.match(paymentGuardMigration, /p_new_status = 'cancelled'[\s\S]*?encrypted_payload = NULL/);
  assert.match(paymentGuardMigration, /Las credenciales de la orden ya no estan disponibles/);
  assert.match(paymentGuardMigration, /SECURITY DEFINER\s*SET search_path TO ''/);
  assert.match(
    paymentGuardMigration,
    /REVOKE EXECUTE ON FUNCTION public\.transition_order_secure\(uuid, uuid, text\)[\s\S]*?FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    paymentGuardMigration,
    /GRANT EXECUTE ON FUNCTION public\.transition_order_secure\(uuid, uuid, text\)[\s\S]*?TO service_role;/,
  );
});

test('the dialog warns about irreversible credential destruction and identifies the order', () => {
  assert.match(adminSource, /Cancelar esta orden eliminará de forma irreversible las credenciales asociadas\./);
  assert.match(adminSource, /Esta acción no se puede deshacer\./);
  assert.match(adminSource, /pendingCancellationOrder\.id\.slice\(0, 8\)/);
  assert.match(adminSource, /getOrderServiceSummary\(pendingCancellationOrder\)/);
  assert.match(adminSource, />\s*Volver\s*</);
  assert.match(adminSource, /'Cancelar orden'/);
});

test('going back closes the dialog without invoking a transition', () => {
  assert.match(
    adminSource,
    /onClick=\{\(\) => setPendingCancellationOrder\(null\)\}[\s\S]*?disabled=\{cancellationLoading\}[\s\S]*?>\s*Volver\s*</,
  );
});

test('the cancellation lock allows exactly one concurrent transition', async () => {
  const lock = { current: false };
  let calls = 0;
  let releaseTransition;
  const transitionBlocked = new Promise((resolve) => {
    releaseTransition = resolve;
  });

  const transition = async () => {
    calls += 1;
    await transitionBlocked;
    return true;
  };

  const first = runOrderCancellationOnce(lock, transition);
  const second = runOrderCancellationOnce(lock, transition);

  assert.equal(await second, null);
  assert.equal(calls, 1);

  releaseTransition();
  assert.equal(await first, true);
  assert.equal(lock.current, false);
});

test('confirming uses the existing transition flow once and exposes a loading state', () => {
  const cancellationCalls = adminSource.match(/performOrderStatusChange\(order, 'cancelled'\)/g) ?? [];

  assert.equal(cancellationCalls.length, 1);
  assert.match(adminSource, /runOrderCancellationOnce\(cancellationLock/);
  assert.match(adminSource, /disabled=\{cancellationLoading\}/);
  assert.match(adminSource, /'Cancelando…'/);
  assert.match(adminSource, /if \(updated\) \{\s*setPendingCancellationOrder\(null\);/);
  assert.match(adminSource, /Su estado no cambió/);
});

test('the existing secure transition endpoint and payload remain in use', () => {
  assert.match(adminSource, /\/functions\/v1\/complete-order/);
  assert.match(adminSource, /body: JSON\.stringify\(\{ orderId: order\.id, status \}\)/);
  assert.doesNotMatch(adminSource, /transition_order_secure/);
});
