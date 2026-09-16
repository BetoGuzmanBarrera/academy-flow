import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  calculateAdminReferralMetrics,
  emptyAdminReferralFilters,
  filterAdminReferralCodes,
  getRecentUsesForCode,
} from '../src/lib/adminReferralMetrics.ts';

const componentSource = readFileSync(
  new URL('../src/components/AdminReferralMetrics.tsx', import.meta.url),
  'utf8',
);
const adminSource = readFileSync(new URL('../src/pages/Admin.tsx', import.meta.url), 'utf8');
const referralRateLimitMigration = readFileSync(
  new URL('../supabase/migrations/20260914075900_rate_limit_referral_code_validation.sql', import.meta.url),
  'utf8',
);
const secureOrderMigration = readFileSync(
  new URL('../supabase/migrations/20260805000100_admin_and_secure_checkout.sql', import.meta.url),
  'utf8',
);

const codes = [
  {
    id: 'code-1',
    user_id: 'owner-1111-aaaa',
    code: 'ACADEMY1',
    uses_count: 2,
    created_at: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'code-2',
    user_id: 'owner-2222-bbbb',
    code: 'NUEVO222',
    uses_count: 0,
    created_at: '2026-09-15T12:01:00.000Z',
  },
];

const uses = [
  {
    id: 'use-1',
    referral_code_id: 'code-1',
    used_by_user_id: 'customer-1',
    order_id: 'order-1111-aaaa',
    discount_amount: 30,
    created_at: '2026-09-15T13:00:00.000Z',
  },
  {
    id: 'use-2',
    referral_code_id: 'code-1',
    used_by_user_id: 'customer-2',
    order_id: 'order-2222-bbbb',
    discount_amount: 45.5,
    created_at: '2026-09-15T13:01:00.000Z',
  },
];

test('searches referral codes by code, owner, and recent order without case sensitivity', () => {
  assert.deepEqual(filterAdminReferralCodes(codes, uses, {
    ...emptyAdminReferralFilters,
    search: ' academy1 ',
  }), [codes[0]]);
  assert.deepEqual(filterAdminReferralCodes(codes, uses, {
    ...emptyAdminReferralFilters,
    search: 'OWNER-2222',
  }), [codes[1]]);
  assert.deepEqual(filterAdminReferralCodes(codes, uses, {
    ...emptyAdminReferralFilters,
    search: 'ORDER-1111',
  }), [codes[0]]);
});

test('filters codes with uses and without uses', () => {
  assert.deepEqual(filterAdminReferralCodes(codes, uses, {
    search: '',
    usage: 'with_uses',
  }), [codes[0]]);
  assert.deepEqual(filterAdminReferralCodes(codes, uses, {
    search: '',
    usage: 'without_uses',
  }), [codes[1]]);
});

test('combines search and usage filters and supports an empty state', () => {
  assert.deepEqual(filterAdminReferralCodes(codes, uses, {
    search: 'ACADEMY1',
    usage: 'with_uses',
  }), [codes[0]]);
  assert.deepEqual(filterAdminReferralCodes(codes, uses, {
    search: 'ACADEMY1',
    usage: 'without_uses',
  }), []);
});

test('calculates exact counts and clearly bounded recent metrics', () => {
  assert.deepEqual(calculateAdminReferralMetrics({
    codesTotal: 5,
    codesUsed: 2,
    usesTotal: 8,
  }, uses), {
    codesTotal: 5,
    codesUsed: 2,
    codesUnused: 3,
    usesTotal: 8,
    recentCustomers: 2,
    recentDiscount: 75.5,
  });
  assert.deepEqual(getRecentUsesForCode('code-1', uses), uses);
});

test('filtering and metrics never mutate the original lists', () => {
  const codesSnapshot = structuredClone(codes);
  const usesSnapshot = structuredClone(uses);

  filterAdminReferralCodes(codes, uses, emptyAdminReferralFilters);
  calculateAdminReferralMetrics({ codesTotal: 2, codesUsed: 1, usesTotal: 2 }, uses);
  getRecentUsesForCode('code-1', uses);

  assert.deepEqual(codes, codesSnapshot);
  assert.deepEqual(uses, usesSnapshot);
});

test('referral admin module is bounded and strictly read-only', () => {
  assert.match(componentSource, /\.from\('referral_codes'\)/);
  assert.match(componentSource, /\.from\('referral_uses'\)/);
  assert.equal((componentSource.match(/\.limit\(DATA_LIMIT\)/g) ?? []).length, 2);
  assert.match(componentSource, /const DATA_LIMIT = 100/);
  assert.doesNotMatch(componentSource, /\.insert\s*\(/);
  assert.doesNotMatch(componentSource, /\.update\s*\(/);
  assert.doesNotMatch(componentSource, /\.delete\s*\(/);
  assert.doesNotMatch(componentSource, /validate_referral_code|create_secure_order/);
  assert.match(componentSource, /No hay códigos de referido para mostrar/);
  assert.match(componentSource, /No hay códigos que coincidan con los filtros/);
  assert.match(adminSource, /<AdminMfaGate/);
  assert.match(adminSource, /tab === 'referrals'.*<AdminReferralMetrics/s);
});

test('existing referral rate limit and server-side checkout revalidation remain intact', () => {
  assert.match(referralRateLimitMigration, /IF v_attempt_count > 20 THEN/i);
  assert.match(referralRateLimitMigration, /interval '10 minutes'/i);
  assert.match(referralRateLimitMigration, /FROM public\.referral_codes/i);
  assert.match(secureOrderMigration, /FROM public\.referral_codes\s+WHERE code = normalized_referral/i);
  assert.match(secureOrderMigration, /INSERT INTO public\.referral_uses/i);
});
