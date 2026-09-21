import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL(
  '../supabase/migrations/20260920202500_harden_referral_validation_receipts.sql',
  import.meta.url,
), 'utf8');
const edge = readFileSync(new URL(
  '../supabase/functions/create-secure-order/index.ts', import.meta.url,
), 'utf8');

function definition(name) {
  const start = migration.lastIndexOf(`CREATE FUNCTION public.${name}(`) >= 0
    ? migration.lastIndexOf(`CREATE FUNCTION public.${name}(`)
    : migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.notEqual(start, -1, `${name} missing`);
  const end = migration.indexOf('\n$$;', start);
  assert.notEqual(end, -1, `${name} body missing`);
  return migration.slice(start, end);
}

test('one atomic 20/10m counter is shared by browser and direct order creation', () => {
  const limiter = definition('consume_referral_validation_attempt_secure');
  const browser = definition('validate_referral_code');
  const preparation = definition('prepare_referral_code_secure');
  assert.match(limiter, /ON CONFLICT \(user_id\) DO UPDATE/i);
  assert.match(limiter, /interval '10 minutes'/i);
  assert.match(limiter, /IF v_attempt_count > 20 THEN/i);
  assert.match(browser, /PERFORM public\.consume_referral_validation_attempt_secure\(v_user_id\)/);
  assert.match(preparation, /PERFORM public\.consume_referral_validation_attempt_secure\(p_user_id\)/);
  assert.ok(browser.indexOf('consume_referral_validation_attempt_secure') <
    browser.indexOf('FROM public.referral_codes'));
  assert.ok(preparation.lastIndexOf('consume_referral_validation_attempt_secure') <
    preparation.lastIndexOf('FROM public.referral_codes'));
});

test('recent proof is private, user- and code-bound, expiring and single-use', () => {
  const order = definition('create_secure_order');
  assert.match(migration, /PRIMARY KEY \(user_id, normalized_code\)/);
  assert.match(migration, /ALTER TABLE public\.referral_validation_receipts ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /FROM PUBLIC, anon, authenticated, service_role/);
  for (const condition of [
    'receipt.user_id = p_user_id', 'receipt.normalized_code = v_code',
    'receipt.referral_code_id = v_referral_id',
    'receipt.referral_owner_id = v_owner_id',
    'receipt.consumed_at IS NULL', 'receipt.expires_at > clock_timestamp()',
  ]) assert.ok(order.includes(condition), `${condition} missing`);
  assert.match(order, /FOR UPDATE/);
  assert.match(order, /SET consumed_at = clock_timestamp\(\), consumed_order_id = p_order_id/);
  assert.ok(order.indexOf('FOR UPDATE') < order.indexOf('create_secure_order_unchecked'));
  assert.ok(order.indexOf('create_secure_order_unchecked') < order.indexOf('SET consumed_at'));
});

test('a changed or deleted referral is checked before order creation', () => {
  const order = definition('create_secure_order');
  assert.match(order, /WHERE code\.code = v_code\s+FOR SHARE/);
  assert.match(order, /v_referral_id IS NULL OR v_owner_id = p_user_id/);
  assert.ok(order.indexOf('FROM public.referral_codes') <
    order.indexOf('create_secure_order_unchecked'));
});

test('the former direct order implementation is not exposed as an executable overload', () => {
  assert.match(migration, /ALTER FUNCTION public\.create_secure_order\(uuid, uuid, text, text, jsonb, jsonb\)\s+RENAME TO create_secure_order_unchecked/);
  assert.match(migration, /SET SCHEMA academy_internal/);
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION academy_internal\.create_secure_order_unchecked\([\s\S]*?FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.create_secure_order\([\s\S]*?FROM PUBLIC, anon, authenticated/);
  assert.match(edge, /prepare_referral_code_secure/);
  assert.ok(edge.indexOf('prepare_referral_code_secure') <
    edge.indexOf('key = await getEncryptionKey()'));
  assert.ok(edge.indexOf('prepare_referral_code_secure') < edge.indexOf("rpc('create_secure_order'"));
});
