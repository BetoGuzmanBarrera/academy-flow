import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyAdminOrderFilters,
  filterAdminOrders,
  hasActiveAdminOrderFilters,
} from '../src/lib/adminOrderFilters.ts';

const orders = [
  {
    id: 'a1111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    status: 'pending',
    payment_status: 'pending',
    items: [{ service: { name: 'Coursera Excel' } }],
  },
  {
    id: 'b2222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    status: 'in_progress',
    payment_status: 'paid',
    items: [{ service: { name: 'ALEKS Universidad' } }],
  },
  {
    id: 'c3333333-cccc-cccc-cccc-cccccccccccc',
    status: 'completed',
    payment_status: 'refunded',
    items: null,
  },
];

const filters = (overrides = {}) => ({ ...emptyAdminOrderFilters, ...overrides });

test('searches by a complete order id', () => {
  assert.deepEqual(filterAdminOrders(orders, filters({ search: orders[1].id })), [orders[1]]);
});

test('searches by a short order id prefix', () => {
  assert.deepEqual(filterAdminOrders(orders, filters({ search: 'a1111111' })), [orders[0]]);
});

test('search is case-insensitive and trims surrounding spaces', () => {
  assert.deepEqual(filterAdminOrders(orders, filters({ search: '  courSERA  ' })), [orders[0]]);
});

test('searches by service name', () => {
  assert.deepEqual(filterAdminOrders(orders, filters({ search: 'universidad' })), [orders[1]]);
});

test('filters by order status', () => {
  assert.deepEqual(filterAdminOrders(orders, filters({ status: 'completed' })), [orders[2]]);
});

test('filters by payment status', () => {
  assert.deepEqual(filterAdminOrders(orders, filters({ paymentStatus: 'paid' })), [orders[1]]);
});

test('combines search, order status, and payment status', () => {
  assert.deepEqual(
    filterAdminOrders(
      orders,
      filters({ search: 'aleks', status: 'in_progress', paymentStatus: 'paid' }),
    ),
    [orders[1]],
  );
});

test('empty filters restore every order', () => {
  assert.deepEqual(filterAdminOrders(orders, emptyAdminOrderFilters), orders);
  assert.equal(hasActiveAdminOrderFilters(emptyAdminOrderFilters), false);
});

test('reports active filters and supports zero results', () => {
  const activeFilters = filters({ search: 'no existe' });

  assert.equal(hasActiveAdminOrderFilters(activeFilters), true);
  assert.deepEqual(filterAdminOrders(orders, activeFilters), []);
});

test('filtering does not mutate the original list', () => {
  const before = structuredClone(orders);

  filterAdminOrders(orders, filters({ status: 'pending', paymentStatus: 'pending' }));

  assert.deepEqual(orders, before);
});
