import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const cartSource = readSource('src/components/Cart.tsx');
const checkoutSource = readSource('src/pages/Checkout.tsx');
const credentialsSource = readSource('src/components/CredentialsForm.tsx');

test('cart uses the shared Stripe minimum and calculates the missing amount dynamically', () => {
  assert.match(cartSource, /import\s*\{\s*STRIPE_MINIMUM_MXN\s*\}/);
  assert.match(cartSource, /Math\.max\(0,\s*STRIPE_MINIMUM_MXN\s*-\s*totalAmount\)/);
  assert.match(cartSource, /totalAmount\s*<\s*STRIPE_MINIMUM_MXN/);
  assert.match(cartSource, /missingAmount\.toFixed\(2\)/);
});

test('checkout preserves the post-referral total and Stripe minimum guard', () => {
  assert.match(checkoutSource, /import\s*\{\s*STRIPE_MINIMUM_MXN\s*\}/);
  assert.match(checkoutSource, /finalAmount\s*=\s*totalAmount\s*-\s*discountAmount/);
  assert.match(checkoutSource, /belowStripeMinimum\s*=\s*finalAmount\s*<\s*STRIPE_MINIMUM_MXN/);
  assert.match(checkoutSource, /Math\.max\(0,\s*STRIPE_MINIMUM_MXN\s*-\s*finalAmount\)/);
  assert.match(checkoutSource, /if\s*\(belowStripeMinimum\)/);
});

test('Stripe is the only visible payment path and uses the approved copy', () => {
  const visibleSources = `${cartSource}\n${checkoutSource}`;
  assert.doesNotMatch(visibleSources, /PayPal/i);
  assert.doesNotMatch(checkoutSource, /CFDI|RFC|Raz[oó]n social|R[eé]gimen fiscal|factura/i);
  assert.match(checkoutSource, /Tarjeta de d[eé]bito\/cr[eé]dito/i);
  assert.match(checkoutSource, /Pago procesado de forma segura con Stripe/);
});

test('secure order creation remains compatible while billing stays disabled', () => {
  assert.match(checkoutSource, /functions\/v1\/create-secure-order/);
  assert.match(checkoutSource, /functions\/v1\/create-checkout-session/);
  assert.match(checkoutSource, /paymentMethod:\s*['"]card['"]/);
  assert.match(checkoutSource, /billing:\s*null/);
});

test('referral validation, self-use protection, discount, and removal stay intact', () => {
  assert.match(checkoutSource, /rpc\(['"]validate_referral_code['"]/);
  assert.match(checkoutSource, /data\.self_use/);
  assert.match(checkoutSource, /totalAmount\s*\*\s*0\.3/);
  assert.match(checkoutSource, /referralSuccess\s*\?\s*referralCode\.toUpperCase\(\)\s*:\s*null/);
  assert.match(checkoutSource, /handleRemoveReferralCode/);
});

test('checkout retains its double-submit lock and pending-order redirect failure state', () => {
  assert.match(checkoutSource, /submitLockRef\s*=\s*useRef\(false\)/);
  assert.match(checkoutSource, /if\s*\(submitLockRef\.current\)\s*return/);
  assert.match(checkoutSource, /submitLockRef\.current\s*=\s*true/);
  assert.match(checkoutSource, /submitLockRef\.current\s*=\s*false/);
  assert.match(checkoutSource, /La orden fue creada, pero no pudimos iniciar el pago/);
  assert.match(checkoutSource, /registrada como pendiente/);
});

test('cart preserves edit, remove, quantity, and customization behavior', () => {
  assert.match(cartSource, /<Drawer/);
  assert.match(cartSource, /updateQuantity\(/);
  assert.match(cartSource, /removeFromCart\(/);
  assert.match(cartSource, /updateItemDetails\(/);
  assert.match(cartSource, /<ServiceCustomizationModal/);
  assert.match(cartSource, /mode="edit"/);
});

test('cart controls and credential password visibility have accessible labels and touch targets', () => {
  assert.match(cartSource, /Disminuir cantidad de/);
  assert.match(cartSource, /Aumentar cantidad de/);
  assert.match(cartSource, /Eliminar \$\{item\.service\.name\} del carrito/);
  assert.match(cartSource, /min-h-touch min-w-touch/);
  assert.match(credentialsSource, /Ocultar contraseña/);
  assert.match(credentialsSource, /Mostrar contraseña/);
  assert.match(credentialsSource, /min-h-touch min-w-touch/);
});

test('new cart and checkout layouts are fluid and contain no sample commerce data', () => {
  for (const source of [cartSource, checkoutSource]) {
    assert.doesNotMatch(source, /(?:width|w-)\s*[:=]?\s*\[?390px/i);
    assert.doesNotMatch(source, /const\s+(?:items|services|prices)\s*=\s*\[/i);
    assert.doesNotMatch(source, /00000000-0000-0000-0000-000000000000/);
  }
});

test('checkout retains the real service, quantity, subtotal, and credentials data flow', () => {
  assert.match(checkoutSource, /items\.map\(/);
  assert.match(checkoutSource, /item\.service\.price/);
  assert.match(checkoutSource, /item\.quantity/);
  assert.match(checkoutSource, /credentials\[item\.service_id\]/);
  assert.match(checkoutSource, /<ServiceDetails/);
  assert.match(checkoutSource, /<CredentialsForm/);
});
