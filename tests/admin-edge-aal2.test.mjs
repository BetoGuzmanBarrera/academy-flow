import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'https://esm.sh/@supabase/supabase-js@2') {
      return { url: 'admin-edge-test:supabase', shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === 'admin-edge-test:supabase') {
      return {
        format: 'module',
        source: 'export const createClient = (...args) => globalThis.__adminEdgeTestHooks.createClient(...args);',
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

let registeredHandler;

globalThis.__adminEdgeTestHooks = {};
globalThis.Deno = {
  env: {
    get(name) {
      return globalThis.__adminEdgeTestHooks.getEnv(name);
    },
  },
  serve(handler) {
    registeredHandler = handler;
  },
};

await import('../supabase/functions/complete-order/index.ts?admin-aal2-test');
const completeOrderHandler = registeredHandler;
await import('../supabase/functions/list-order-credentials/index.ts?admin-aal2-test');
const listCredentialsHandler = registeredHandler;
await import('../supabase/functions/reveal-order-credentials/index.ts?admin-aal2-test');
const revealCredentialHandler = registeredHandler;

function createHarness({ role = 'admin', aal = 'aal1' } = {}) {
  const state = {
    aalTokens: [],
    transitionCalls: [],
    credentialListReads: 0,
    credentialRevealReads: 0,
    revealRateLimitCalls: 0,
    auditInserts: [],
    encryptionKeyReads: 0,
  };

  const userClient = {
    auth: {
      getUser: async () => ({
        data: { user: { id: 'admin-user' } },
        error: null,
      }),
      mfa: {
        getAuthenticatorAssuranceLevel: async (jwt) => {
          state.aalTokens.push(jwt);
          return { data: { currentLevel: aal, nextLevel: 'aal2' }, error: null };
        },
      },
    },
  };

  const adminClient = {
    rpc(name, args) {
      if (name === 'transition_order_secure') {
        state.transitionCalls.push(args);
        return Promise.resolve({ data: null, error: null });
      }
      if (name === 'check_reveal_rate_limit') {
        state.revealRateLimitCalls += 1;
        return Promise.resolve({ data: true, error: null });
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
    from(table) {
      if (table === 'profiles') {
        return {
          select() { return this; },
          eq() { return this; },
          single: async () => ({ data: { role }, error: null }),
        };
      }

      if (table === 'credential_access_log') {
        return {
          insert: async (payload) => {
            state.auditInserts.push(payload);
            return { error: null };
          },
        };
      }

      if (table === 'order_credentials') {
        return {
          select() { return this; },
          order: async () => {
            state.credentialListReads += 1;
            return { data: [], error: null };
          },
          eq() {
            state.credentialRevealReads += 1;
            return this;
          },
          single: async () => ({ data: null, error: { code: 'not_found' } }),
        };
      }

      if (table === 'services') {
        return {
          select() { return this; },
          in: async () => ({ data: [], error: null }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  globalThis.__adminEdgeTestHooks.createClient = (_url, key) =>
    key === 'anon-key' ? userClient : adminClient;
  globalThis.__adminEdgeTestHooks.getEnv = (name) => {
    if (name === 'CREDENTIALS_ENCRYPTION_KEY_V1') {
      state.encryptionKeyReads += 1;
      return '00'.repeat(32);
    }
    return {
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    }[name];
  };

  return state;
}

function post(path, body) {
  return new Request(`https://project.supabase.co/functions/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer authenticated-jwt',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function responseBody(response) {
  return { status: response.status, body: await response.json() };
}

test('admin aal1 is rejected by every sensitive Edge Function before protected work', async () => {
  const completeState = createHarness();
  const completeResult = await responseBody(await completeOrderHandler(post('complete-order', {
    orderId: 'order-1',
    status: 'completed',
  })));
  assert.deepEqual(completeResult, { status: 403, body: { error: 'MFA verification required' } });
  assert.equal(completeState.transitionCalls.length, 0);

  const listState = createHarness();
  const listResult = await responseBody(await listCredentialsHandler(post('list-order-credentials', {})));
  assert.deepEqual(listResult, { status: 403, body: { error: 'MFA verification required' } });
  assert.equal(listState.credentialListReads, 0);

  const revealState = createHarness();
  const revealResult = await responseBody(await revealCredentialHandler(post('reveal-order-credentials', {
    credentialId: 'credential-1',
  })));
  assert.deepEqual(revealResult, { status: 403, body: { error: 'MFA verification required' } });
  assert.equal(revealState.revealRateLimitCalls, 0);
  assert.equal(revealState.credentialRevealReads, 0);
  assert.equal(revealState.encryptionKeyReads, 0);
  assert.equal(revealState.auditInserts[0].reason_code, 'mfa_required');
});

test('admin aal2 passes the Edge gate and reaches each existing protected flow', async () => {
  const completeState = createHarness({ aal: 'aal2' });
  const completeResult = await responseBody(await completeOrderHandler(post('complete-order', {
    orderId: 'order-1',
    status: 'completed',
  })));
  assert.equal(completeResult.status, 200);
  assert.equal(completeState.transitionCalls.length, 1);

  const listState = createHarness({ aal: 'aal2' });
  const listResult = await responseBody(await listCredentialsHandler(post('list-order-credentials', {})));
  assert.deepEqual(listResult, { status: 200, body: { credentials: [] } });
  assert.equal(listState.credentialListReads, 1);

  const revealState = createHarness({ aal: 'aal2' });
  const revealResult = await responseBody(await revealCredentialHandler(post('reveal-order-credentials', {
    credentialId: 'credential-1',
  })));
  assert.equal(revealResult.status, 404);
  assert.equal(revealState.revealRateLimitCalls, 1);
  assert.equal(revealState.credentialRevealReads, 1);
  assert.equal(revealState.encryptionKeyReads, 0);

  assert.deepEqual(completeState.aalTokens, ['authenticated-jwt']);
  assert.deepEqual(listState.aalTokens, ['authenticated-jwt']);
  assert.deepEqual(revealState.aalTokens, ['authenticated-jwt']);
});

test('non-admin remains rejected even when the authenticated session is aal2', async () => {
  const state = createHarness({ role: 'user', aal: 'aal2' });
  const result = await responseBody(await completeOrderHandler(post('complete-order', {
    orderId: 'order-1',
    status: 'completed',
  })));

  assert.deepEqual(result, { status: 403, body: { error: 'Forbidden' } });
  assert.equal(state.aalTokens.length, 0);
  assert.equal(state.transitionCalls.length, 0);
});
