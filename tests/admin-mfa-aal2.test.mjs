import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  getAdminMfaGateDecision,
  getAdminMfaStatus,
} from '../src/lib/adminMfa.ts';

const noFactorStatus = {
  currentLevel: 'aal1',
  nextLevel: 'aal1',
  verifiedTotpFactor: null,
};

const factor = {
  id: 'factor-1',
  factor_type: 'totp',
  status: 'verified',
};

test('admin at aal1 without a verified factor is sent to enrollment', () => {
  assert.equal(getAdminMfaGateDecision(true, noFactorStatus), 'enroll');
});

test('admin with a verified factor at aal1 must complete a challenge', () => {
  assert.equal(getAdminMfaGateDecision(true, {
    currentLevel: 'aal1',
    nextLevel: 'aal2',
    verifiedTotpFactor: factor,
  }), 'challenge');
});

test('admin at aal2 is allowed into the sensitive dashboard', () => {
  assert.equal(getAdminMfaGateDecision(true, {
    currentLevel: 'aal2',
    nextLevel: 'aal2',
    verifiedTotpFactor: factor,
  }), 'allowed');
});

test('admin with a stale aal2 session but no verified TOTP factor returns to enrollment', () => {
  assert.equal(getAdminMfaGateDecision(true, {
    currentLevel: 'aal2',
    nextLevel: 'aal1',
    verifiedTotpFactor: null,
  }), 'enroll');
});

test('non-admin is denied even when the session is aal2', () => {
  assert.equal(getAdminMfaGateDecision(false, {
    currentLevel: 'aal2',
    nextLevel: 'aal2',
    verifiedTotpFactor: factor,
  }), 'denied');
});

test('MFA status is derived from official factors and assurance APIs', async () => {
  const status = await getAdminMfaStatus({
    listFactors: async () => ({ data: { totp: [factor] }, error: null }),
    getAuthenticatorAssuranceLevel: async () => ({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    }),
  });

  assert.deepEqual(status, {
    currentLevel: 'aal1',
    nextLevel: 'aal2',
    verifiedTotpFactor: factor,
  });
});

test('frontend uses the official MFA enrollment and challenge flow without client-side secret storage', () => {
  const source = readFileSync(
    new URL('../src/components/AdminMfaGate.tsx', import.meta.url),
    'utf8',
  );

  for (const api of ['mfa.enroll', 'mfa.challenge', 'mfa.verify', 'auth.refreshSession']) {
    assert.match(source, new RegExp(api.replace('.', '\\.')));
  }
  assert.match(source, /getAdminMfaStatus/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\./);

  const adminPage = readFileSync(new URL('../src/pages/Admin.tsx', import.meta.url), 'utf8');
  assert.match(adminPage, /<AdminMfaGate[\s\S]*?key=\{user\?\.id \?\? 'anonymous'\}/);
});
