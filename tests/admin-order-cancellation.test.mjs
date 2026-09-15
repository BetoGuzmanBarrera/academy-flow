import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  requiresOrderCancellationConfirmation,
  runOrderCancellationOnce,
} from '../src/lib/adminOrderCancellation.ts';

const adminSource = readFileSync(new URL('../src/pages/Admin.tsx', import.meta.url), 'utf8');

test('only cancelled transitions require the destructive confirmation', () => {
  assert.equal(requiresOrderCancellationConfirmation('cancelled'), true);
  assert.equal(requiresOrderCancellationConfirmation('pending'), false);
  assert.equal(requiresOrderCancellationConfirmation('in_progress'), false);
  assert.equal(requiresOrderCancellationConfirmation('completed'), false);

  assert.match(
    adminSource,
    /if \(requiresOrderCancellationConfirmation\(status\)\) \{[\s\S]*?setPendingCancellationOrder\(order\);[\s\S]*?return;[\s\S]*?\}\s*void performOrderStatusChange\(order, status\);/,
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
