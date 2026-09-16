import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  canRevealCredential,
  filterAdminCredentials,
  filterCredentialAccessLogs,
  getCredentialLifecycleState,
  runCredentialRevealOnce,
} from '../src/lib/adminCredentialAudit.ts';

const adminSource = readFileSync(new URL('../src/pages/Admin.tsx', import.meta.url), 'utf8');
const listCredentialsSource = readFileSync(
  new URL('../supabase/functions/list-order-credentials/index.ts', import.meta.url),
  'utf8',
);
const revealSource = readFileSync(
  new URL('../supabase/functions/reveal-order-credentials/index.ts', import.meta.url),
  'utf8',
);

const now = Date.parse('2026-09-15T12:00:00.000Z');
const baseCredential = {
  credentialId: 'credential-1234',
  orderId: 'order-1234',
  serviceId: 'service-1234',
  serviceName: 'Coursera Excel',
  orderStatus: 'in_progress',
  createdAt: '2026-09-14T12:00:00.000Z',
  updatedAt: '2026-09-14T13:00:00.000Z',
  expiresAt: null,
  deletedAt: null,
  hasEncryptedPayload: true,
};

test('derives available, expiring, expired, deleted, and unavailable lifecycle states', () => {
  assert.equal(getCredentialLifecycleState(baseCredential, now), 'available');
  assert.equal(getCredentialLifecycleState({
    ...baseCredential,
    expiresAt: '2026-09-16T06:00:00.000Z',
  }, now), 'expiring_soon');
  assert.equal(getCredentialLifecycleState({
    ...baseCredential,
    expiresAt: '2026-09-15T11:59:59.000Z',
  }, now), 'expired');
  assert.equal(getCredentialLifecycleState({
    ...baseCredential,
    deletedAt: '2026-09-15T10:00:00.000Z',
  }, now), 'deleted');
  assert.equal(getCredentialLifecycleState({
    ...baseCredential,
    hasEncryptedPayload: false,
  }, now), 'unavailable');
  assert.equal(canRevealCredential(baseCredential, now), true);
  assert.equal(canRevealCredential({ ...baseCredential, hasEncryptedPayload: false }, now), false);
});

test('filters credentials by order, service, and lifecycle without mutating input', () => {
  const credentials = [
    baseCredential,
    {
      ...baseCredential,
      credentialId: 'credential-5678',
      orderId: 'order-5678',
      serviceName: 'ALEKS Universidad',
      deletedAt: '2026-09-15T10:00:00.000Z',
    },
  ];
  const snapshot = structuredClone(credentials);

  assert.deepEqual(filterAdminCredentials(credentials, {
    search: 'ORDER-5678',
    state: 'deleted',
  }, now), [credentials[1]]);
  assert.deepEqual(filterAdminCredentials(credentials, {
    search: 'coursera',
    state: 'available',
  }, now), [credentials[0]]);
  assert.deepEqual(credentials, snapshot);
});

test('filters audit logs by action and outcome without mutating input', () => {
  const logs = [
    {
      id: 'log-1',
      credential_id: 'credential-1234',
      order_id: 'order-1234',
      requested_credential_id: 'credential-1234',
      action: 'revealed',
      success: true,
      reason_code: null,
      request_id: 'request-1',
      created_at: '2026-09-15T11:00:00.000Z',
    },
    {
      id: 'log-2',
      credential_id: null,
      order_id: null,
      requested_credential_id: 'credential-5678',
      action: 'reveal_denied',
      success: false,
      reason_code: 'rate_limited',
      request_id: 'request-2',
      created_at: '2026-09-15T11:01:00.000Z',
    },
  ];
  const snapshot = structuredClone(logs);

  assert.deepEqual(filterCredentialAccessLogs(logs, {
    search: 'rate_limited',
    action: 'reveal_denied',
    outcome: 'failure',
  }), [logs[1]]);
  assert.deepEqual(logs, snapshot);
});

test('reveal lock allows only one concurrent request and releases for retry', async () => {
  const lock = { current: false };
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });

  const first = runCredentialRevealOnce(lock, async () => {
    calls += 1;
    await pending;
    return 'revealed';
  });
  const second = runCredentialRevealOnce(lock, async () => 'duplicate');

  assert.equal(await second, null);
  assert.equal(calls, 1);
  release();
  assert.equal(await first, 'revealed');
  assert.equal(lock.current, false);
});

test('reveal remains explicit, server-side, AAL2 protected, and never automatic', () => {
  const loadCredentials = adminSource.slice(
    adminSource.indexOf('const loadCredentials'),
    adminSource.indexOf('const handleRevealCredential'),
  );

  assert.doesNotMatch(loadCredentials, /reveal-order-credentials/);
  assert.match(adminSource, /setPendingRevealCredential\(credential\)/);
  assert.match(adminSource, /runCredentialRevealOnce\(revealLock/);
  assert.match(adminSource, /setRevealedCredential\(null\)/);
  assert.match(adminSource, /Se ocultarán automáticamente en 30 segundos/);
  assert.match(listCredentialsSource, /hasVerifiedAal2/);
  assert.match(revealSource, /hasVerifiedAal2/);
  assert.match(revealSource, /check_reveal_rate_limit/);
  assert.match(revealSource, /crypto\.subtle\.decrypt/);
  assert.doesNotMatch(adminSource, /CREDENTIALS_ENCRYPTION_KEY/);
});

test('credential listing returns sanitized metadata and audit loading is bounded', () => {
  assert.match(listCredentialsSource, /updated_at/);
  assert.doesNotMatch(listCredentialsSource, /encryption_iv/);
  assert.doesNotMatch(listCredentialsSource, /key_version/);
  assert.match(adminSource, /\.from\('credential_access_log'\)/);
  assert.match(adminSource, /\.limit\(100\)/);
  assert.match(adminSource, /No hay credenciales registradas\./);
  assert.match(adminSource, /No hay registros de auditoría para mostrar\./);
});
