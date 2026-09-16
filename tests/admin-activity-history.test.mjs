import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  emptyAdminActivityFilters,
  emptyOrderHistoryFilters,
  filterAdminActivityLogs,
  filterOrderStatusHistory,
  getSafeAdminMetadata,
} from '../src/lib/adminActivityHistory.ts';

const activitySource = readFileSync(
  new URL('../src/components/AdminActivityHistory.tsx', import.meta.url),
  'utf8',
);
const adminSource = readFileSync(new URL('../src/pages/Admin.tsx', import.meta.url), 'utf8');

const activityLogs = [
  {
    id: 'activity-1',
    admin_id: 'admin-1111-aaaa',
    action: 'create',
    target_table: 'services',
    target_id: 'service-1111-aaaa',
    details: { name: 'Coursera Excel', category_id: 'category-1' },
    created_at: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'activity-2',
    admin_id: 'admin-2222-bbbb',
    action: 'status_change',
    target_table: 'orders',
    target_id: 'order-2222-bbbb',
    details: { from: 'pending', to: 'in_progress' },
    created_at: '2026-09-15T12:01:00.000Z',
  },
];

const orderHistory = [
  {
    id: 'history-1',
    order_id: 'order-1111-aaaa',
    from_status: 'pending',
    to_status: 'in_progress',
    changed_by: 'admin-1111-aaaa',
    created_at: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'history-2',
    order_id: 'order-2222-bbbb',
    from_status: 'in_progress',
    to_status: 'completed',
    changed_by: 'admin-2222-bbbb',
    created_at: '2026-09-15T12:01:00.000Z',
  },
];

test('searches activity by resource and administrator ids without case sensitivity', () => {
  assert.deepEqual(filterAdminActivityLogs(activityLogs, {
    ...emptyAdminActivityFilters,
    search: ' SERVICE-1111 ',
  }), [activityLogs[0]]);
  assert.deepEqual(filterAdminActivityLogs(activityLogs, {
    ...emptyAdminActivityFilters,
    search: 'ADMIN-2222',
  }), [activityLogs[1]]);
});

test('filters activity by action and resource type, including combined filters', () => {
  assert.deepEqual(filterAdminActivityLogs(activityLogs, {
    search: '',
    action: 'status_change',
    targetTable: 'orders',
  }), [activityLogs[1]]);
  assert.deepEqual(filterAdminActivityLogs(activityLogs, {
    search: '',
    action: 'create',
    targetTable: 'orders',
  }), []);
});

test('searches order history by order and responsible administrator', () => {
  assert.deepEqual(filterOrderStatusHistory(orderHistory, {
    ...emptyOrderHistoryFilters,
    search: 'ORDER-2222',
  }), [orderHistory[1]]);
  assert.deepEqual(filterOrderStatusHistory(orderHistory, {
    ...emptyOrderHistoryFilters,
    search: 'admin-1111',
  }), [orderHistory[0]]);
});

test('filters previous and new status together', () => {
  assert.deepEqual(filterOrderStatusHistory(orderHistory, {
    search: '',
    fromStatus: 'pending',
    toStatus: 'in_progress',
  }), [orderHistory[0]]);
  assert.deepEqual(filterOrderStatusHistory(orderHistory, {
    search: '',
    fromStatus: 'pending',
    toStatus: 'completed',
  }), []);
});

test('clearing filters restores all entries and supports empty results without mutation', () => {
  const activitySnapshot = structuredClone(activityLogs);
  const historySnapshot = structuredClone(orderHistory);

  assert.deepEqual(filterAdminActivityLogs(activityLogs, emptyAdminActivityFilters), activityLogs);
  assert.deepEqual(filterOrderStatusHistory(orderHistory, emptyOrderHistoryFilters), orderHistory);
  assert.equal(filterAdminActivityLogs(activityLogs, {
    ...emptyAdminActivityFilters,
    search: 'sin-coincidencias',
  }).length, 0);
  assert.equal(filterOrderStatusHistory(orderHistory, {
    ...emptyOrderHistoryFilters,
    search: 'sin-coincidencias',
  }).length, 0);
  assert.deepEqual(activityLogs, activitySnapshot);
  assert.deepEqual(orderHistory, historySnapshot);
});

test('safe metadata exposes only approved primitive fields', () => {
  const safe = getSafeAdminMetadata({
    name: 'Servicio seguro',
    status: 'completed',
    password: 'must-not-render',
    token: 'must-not-render',
    jwt: 'must-not-render',
    encrypted_payload: 'must-not-render',
    credentials: { username: 'must-not-render' },
    metadata: ['must-not-render'],
  });

  assert.deepEqual(safe, [
    { label: 'Nombre', value: 'Servicio seguro' },
    { label: 'Estado', value: 'completed' },
  ]);
  assert.doesNotMatch(JSON.stringify(safe), /must-not-render|password|token|jwt|credential|payload/i);
});

test('activity UI is bounded, read-only, and preserves the admin AAL2 gate', () => {
  assert.match(activitySource, /\.from\('admin_activity_log'\)/);
  assert.match(activitySource, /\.from\('order_status_history'\)/);
  assert.equal((activitySource.match(/\.limit\(HISTORY_LIMIT\)/g) ?? []).length, 2);
  assert.match(activitySource, /const HISTORY_LIMIT = 100/);
  assert.doesNotMatch(activitySource, /\.update\s*\(/);
  assert.doesNotMatch(activitySource, /\.delete\s*\(/);
  assert.doesNotMatch(activitySource, /\.insert\s*\(/);
  assert.match(activitySource, /No hay actividad que coincida con los filtros/);
  assert.match(activitySource, /No hay transiciones que coincidan con los filtros/);
  assert.match(adminSource, /<AdminMfaGate/);
  assert.match(adminSource, /tab === 'activity'.*<AdminActivityHistory/s);
});
