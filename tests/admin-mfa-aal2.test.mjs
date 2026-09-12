import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  getAdminMfaGateDecision,
  getAdminMfaStatus,
} from '../src/lib/adminMfa.ts';
import { hasVerifiedAal2 } from '../supabase/functions/_shared/adminMfa.ts';

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

test('Edge AAL2 helper checks the authenticated JWT and fails closed', async () => {
  const checkedTokens = [];
  const client = {
    auth: {
      mfa: {
        async getAuthenticatorAssuranceLevel(jwt) {
          checkedTokens.push(jwt);
          const verified = jwt === 'verified-aal2-jwt';
          return { data: {
            currentLevel: verified ? 'aal2' : 'aal1',
            nextLevel: verified ? 'aal2' : 'aal2',
          }, error: null };
        },
      },
    },
  };

  assert.equal(await hasVerifiedAal2(client, 'verified-aal2-jwt'), true);
  assert.equal(await hasVerifiedAal2(client, 'aal1-jwt'), false);
  assert.deepEqual(checkedTokens, ['verified-aal2-jwt', 'aal1-jwt']);

  const staleAal2Client = {
    auth: {
      mfa: {
        async getAuthenticatorAssuranceLevel() {
          return { data: { currentLevel: 'aal2', nextLevel: 'aal1' }, error: null };
        },
      },
    },
  };
  assert.equal(await hasVerifiedAal2(staleAal2Client, 'stale-aal2-jwt'), false);

  const failingClient = {
    auth: {
      mfa: {
        async getAuthenticatorAssuranceLevel() {
          return { data: null, error: new Error('verification failed') };
        },
      },
    },
  };
  assert.equal(await hasVerifiedAal2(failingClient, 'unverifiable-jwt'), false);
});

test('all sensitive Edge Functions enforce AAL2 after admin role and before sensitive work', () => {
  const cases = [
    ['complete-order', "adminClient.rpc('transition_order_secure'"],
    ['list-order-credentials', ".from('order_credentials')"],
    ['reveal-order-credentials', "adminClient.rpc('check_reveal_rate_limit'"],
  ];

  for (const [slug, sensitiveMarker] of cases) {
    const source = readFileSync(
      new URL(`../supabase/functions/${slug}/index.ts`, import.meta.url),
      'utf8',
    );
    const roleCheck = source.indexOf("profile.role !== 'admin'");
    const aalCheck = source.indexOf('await hasVerifiedAal2');
    const sensitiveWork = source.indexOf(sensitiveMarker);

    assert.ok(roleCheck >= 0, `${slug} retains the admin role check`);
    assert.ok(aalCheck > roleCheck, `${slug} checks AAL2 after the role check`);
    assert.ok(sensitiveWork > aalCheck, `${slug} checks AAL2 before sensitive work`);
    assert.match(source, /MFA verification required/);
  }

  const revealSource = readFileSync(
    new URL('../supabase/functions/reveal-order-credentials/index.ts', import.meta.url),
    'utf8',
  );
  assert.ok(
    revealSource.indexOf('await hasVerifiedAal2') < revealSource.indexOf('const key = await getEncryptionKey()'),
    'AAL1 credential reveal cannot load the encryption key or reach AES-GCM',
  );
});

test('RLS migration changes only existing admin policies and requires admin AAL2', () => {
  const migration = readFileSync(
    new URL('../supabase/migrations/20260912191809_require_admin_aal2.sql', import.meta.url),
    'utf8',
  );
  const policyBlocks = migration.match(/ALTER POLICY[\s\S]*?;/g) ?? [];

  assert.equal(policyBlocks.length, 13);
  for (const block of policyBlocks) {
    assert.match(block, /public\.is_admin\(\)/);
    assert.match(block, /auth\.jwt\(\)[\s\S]*?'aal'[\s\S]*?'aal2'/);
  }

  assert.doesNotMatch(migration, /order_credentials/);
  assert.doesNotMatch(migration, /Admins can update orders/);
  assert.doesNotMatch(migration, /Users can|Guests can|Public/);
  assert.doesNotMatch(migration, /CREATE POLICY|DROP POLICY/);
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
