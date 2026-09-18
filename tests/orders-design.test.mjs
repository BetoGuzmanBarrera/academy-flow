import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ordersSource = readFileSync(new URL('../src/pages/Orders.tsx', import.meta.url), 'utf8');

test('orders keep the authenticated user query and descending creation order', () => {
  assert.match(ordersSource, /\.from\(['"]orders['"]\)/);
  assert.match(ordersSource, /\.eq\(['"]user_id['"],\s*user\.id\)/);
  assert.match(ordersSource, /\.order\(['"]created_at['"],\s*\{\s*ascending:\s*false\s*\}\)/);
});

test('order items keep the service and category relationship query', () => {
  assert.match(ordersSource, /\.from\(['"]order_items['"]\)/);
  assert.match(ordersSource, /service:services\(\*,\s*category:categories\(\*\)\)/);
  assert.match(ordersSource, /\.eq\(['"]order_id['"],\s*orderId\)/);
  assert.match(ordersSource, /order\.items\.map\(/);
});

test('Stripe retry preserves session authentication, order ID, endpoint, and redirect', () => {
  assert.match(ordersSource, /supabase\.auth\.getSession\(\)/);
  assert.match(ordersSource, /session\.data\.session\?\.access_token/);
  assert.match(ordersSource, /functions\/v1\/create-checkout-session/);
  assert.match(ordersSource, /Authorization:\s*`Bearer \$\{accessToken\}`/);
  assert.match(ordersSource, /JSON\.stringify\(\{\s*orderId\s*\}\)/);
  assert.match(ordersSource, /window\.location\.href\s*=\s*result\.sessionUrl/);
});

test('order and payment states retain every real persisted value', () => {
  for (const status of ['completed', 'in_progress', 'pending', 'cancelled']) {
    assert.match(ordersSource, new RegExp(`${status}:`));
  }
  for (const status of ['paid', 'pending', 'failed', 'refunded']) {
    assert.match(ordersSource, new RegExp(`${status}:`));
  }
});

test('only eligible non-cancelled pending or failed payments get the payment action', () => {
  assert.match(ordersSource, /order\.payment_status === ['"]pending['"] \|\| order\.payment_status === ['"]failed['"]/);
  assert.match(ordersSource, /order\.status !== ['"]cancelled['"]/);
  assert.match(ordersSource, /Number\(order\.total_amount\) >= STRIPE_MINIMUM_MXN/);
  assert.doesNotMatch(ordersSource, /order\.payment_status === ['"]paid['"][\s\S]{0,120}handleRetryPayment/);
  assert.doesNotMatch(ordersSource, /order\.payment_status === ['"]refunded['"][\s\S]{0,120}handleRetryPayment/);
});

test('Stripe minimum copy is derived from the shared constant', () => {
  assert.match(ordersSource, /import\s*\{\s*STRIPE_MINIMUM_MXN\s*\}/);
  assert.match(ordersSource, /STRIPE_MINIMUM_MXN\.toFixed\(2\)/);
  assert.doesNotMatch(ordersSource, /\$10(?:\.00)?\s*MXN/);
});

test('expandable details are accessible and display real item pricing and customization', () => {
  assert.match(ordersSource, /aria-expanded=\{isExpanded\}/);
  assert.match(ordersSource, /aria-controls=\{detailsId\}/);
  assert.match(ordersSource, /Ver detalles/);
  assert.match(ordersSource, /Ocultar detalles/);
  assert.match(ordersSource, /<ServiceDetails/);
  assert.match(ordersSource, /item\.unit_price\s*\*\s*item\.quantity/);
  assert.match(ordersSource, /order\.total_amount\.toFixed\(2\)/);
});

test('order-specific and general help keep the existing support integration', () => {
  assert.match(ordersSource, /<PersonalizedHelp[\s\S]*?orderId=\{order\.id\}/);
  assert.match(ordersSource, /onOpenInternalSupport=\{\(\) => openSupportChat\(\)\}/);
  assert.match(ordersSource, /Necesito ayuda con esta orden/);
});

test('orders expose no credential retrieval or secret material', () => {
  assert.doesNotMatch(ordersSource, /list-order-credentials|reveal-order-credentials/);
  assert.doesNotMatch(ordersSource, /encrypted_payload|encryption_iv|CREDENTIALS_ENCRYPTION_KEY/);
  assert.doesNotMatch(ordersSource, /\b(?:username|password)\b/i);
});

test('orders include accessible loading, error, and empty states in a fluid layout', () => {
  assert.match(ordersSource, /role="status"/);
  assert.match(ordersSource, /aria-live="polite"/);
  assert.match(ordersSource, /Cargando tus órdenes…/);
  assert.match(ordersSource, /<Alert[\s\S]*?role="alert"/);
  assert.match(ordersSource, /<EmptyState/);
  assert.doesNotMatch(ordersSource, /(?:width|w-)\s*[:=]?\s*\[?390px/i);
});
