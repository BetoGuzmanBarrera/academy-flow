import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'https://esm.sh/@supabase/supabase-js@2') {
      return { url: 'support-test:supabase', shortCircuit: true };
    }
    if (specifier.endsWith('/_shared/cors.ts')) {
      return { url: 'support-test:cors', shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === 'support-test:supabase') {
      return {
        format: 'module',
        source: 'export const createClient = (...args) => globalThis.__supportTestHooks.createClient(...args);',
        shortCircuit: true,
      };
    }
    if (url === 'support-test:cors') {
      return {
        format: 'module',
        source: `
          export const getCorsHeaders = () => ({ 'Access-Control-Allow-Origin': '*' });
          export const handleOptions = () => new Response(null, { status: 204 });
        `,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

let supportHandler;

globalThis.__supportTestHooks = {};
globalThis.Deno = {
  env: {
    get(name) {
      return {
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_ANON_KEY: 'anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      }[name];
    },
  },
  serve(handler) {
    supportHandler = handler;
  },
};

await import('./index.ts');

const authenticatedUser = {
  id: 'user-a',
  email: 'Owner@Example.com',
  user_metadata: { full_name: 'Metadata Name' },
};

function createHarness({
  user = null,
  authError = user ? null : { code: 'invalid_jwt' },
  profile = { first_name: 'Ana', last_name: 'Propietaria' },
  profileError = null,
  rateAllowed = true,
  rateError = null,
  insertError = null,
} = {}) {
  const state = {
    authCalls: 0,
    adminClientCreates: 0,
    profileCalls: [],
    profileClientRoles: [],
    rpcCalls: [],
    insertCalls: [],
  };

  function profileQuery(role) {
    let selectedId;
    return {
      select() {
        return this;
      },
      eq(column, value) {
        assert.equal(column, 'id');
        selectedId = value;
        return this;
      },
      maybeSingle() {
        state.profileCalls.push(selectedId);
        state.profileClientRoles.push(role);
        return Promise.resolve({ data: profile, error: profileError });
      },
    };
  }

  const userClient = {
    auth: {
      async getUser() {
        state.authCalls += 1;
        return { data: { user }, error: authError };
      },
    },
    from(table) {
      assert.equal(table, 'profiles');
      return profileQuery('authenticated');
    },
  };

  const adminClient = {
    rpc(name, args) {
      state.rpcCalls.push({ name, args });
      return Promise.resolve({ data: rateAllowed, error: rateError });
    },
    from(table) {
      if (table === 'profiles') {
        return profileQuery('service-role');
      }

      assert.equal(table, 'support_messages');
      let insertedPayload;
      return {
        insert(payload) {
          insertedPayload = payload;
          state.insertCalls.push(payload);
          return this;
        },
        select() {
          return this;
        },
        single() {
          if (insertError) return Promise.resolve({ data: null, error: insertError });
          return Promise.resolve({
            data: {
              id: 'support-message-1',
              ...insertedPayload,
              created_at: '2026-08-12T12:00:00.000Z',
              updated_at: '2026-08-12T12:00:00.000Z',
            },
            error: null,
          });
        },
      };
    },
  };

  globalThis.__supportTestHooks.createClient = (_url, key) => {
    if (key === 'anon-key') return userClient;
    state.adminClientCreates += 1;
    return adminClient;
  };

  return state;
}

function requestFor(body, {
  withAuth = false,
  authToken = withAuth ? 'valid-jwt' : null,
  ip = '203.0.113.10',
  forwardedFor = `198.51.100.99, ${ip}`,
  cfConnectingIp = null,
  realIp = null,
} = {}) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (forwardedFor !== null) headers['x-forwarded-for'] = forwardedFor;
  if (cfConnectingIp !== null) headers['cf-connecting-ip'] = cfConnectingIp;
  if (realIp !== null) headers['x-real-ip'] = realIp;
  if (authToken !== null) headers.Authorization = `Bearer ${authToken}`;

  return new Request('https://project.supabase.co/functions/v1/send-support-message', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function expectedActorHash(actor) {
  return createHash('sha256').update(actor).digest('hex');
}

async function responseBody(response) {
  return { status: response.status, body: await response.json() };
}

test('accepts an authenticated user and derives identity from the JWT', async () => {
  const state = createHarness({ user: authenticatedUser });

  const result = await responseBody(await supportHandler(requestFor({
    name: 'Untrusted Name',
    email: 'untrusted@example.com',
    message: '  Necesito ayuda con mi cuenta.  ',
  }, { withAuth: true })));

  assert.equal(result.status, 201);
  assert.equal(state.authCalls, 1);
  assert.deepEqual(state.profileCalls, ['user-a']);
  assert.deepEqual(state.profileClientRoles, ['authenticated']);
  assert.deepEqual(state.insertCalls, [{
    user_id: 'user-a',
    user_email: 'owner@example.com',
    user_name: 'Ana Propietaria',
    message: 'Necesito ayuda con mi cuenta.',
    status: 'pending',
    admin_response: null,
  }]);
  assert.equal(state.rpcCalls[0].name, 'check_support_message_rate_limit');
  assert.equal(state.rpcCalls[0].args.p_max_requests, 5);
  assert.equal(state.rpcCalls[0].args.p_window_seconds, 600);
  assert.match(state.rpcCalls[0].args.p_actor_hash, /^[0-9a-f]{64}$/);
});

test('accepts a valid guest and rate limits by a hashed IP', async () => {
  const state = createHarness();

  const result = await responseBody(await supportHandler(requestFor({
    name: '  Invitada  ',
    email: '  GUEST@Example.com ',
    message: '  Tengo una pregunta. ',
  }, { authToken: 'anon-key' })));

  assert.equal(result.status, 201);
  assert.equal(state.authCalls, 0);
  assert.deepEqual(state.insertCalls, [{
    user_id: null,
    user_email: 'guest@example.com',
    user_name: 'Invitada',
    message: 'Tengo una pregunta.',
    status: 'pending',
    admin_response: null,
  }]);
  assert.equal(state.rpcCalls[0].args.p_max_requests, 3);
  assert.equal(state.rpcCalls[0].args.p_window_seconds, 900);
  assert.match(state.rpcCalls[0].args.p_actor_hash, /^[0-9a-f]{64}$/);
  assert.notEqual(state.rpcCalls[0].args.p_actor_hash, '203.0.113.10');
});

test('uses the gateway-appended IP instead of a spoofed forwarded prefix', async () => {
  const firstState = createHarness();
  await supportHandler(requestFor({
    name: 'Invitada',
    email: 'guest@example.com',
    message: 'Primer mensaje',
  }, { ip: '203.0.113.10' }));
  const firstActorHash = firstState.rpcCalls[0].args.p_actor_hash;

  const secondState = createHarness();
  const request = requestFor({
    name: 'Invitada',
    email: 'guest@example.com',
    message: 'Segundo mensaje',
  }, { ip: '203.0.113.10' });
  request.headers.set('x-forwarded-for', '192.0.2.200, 203.0.113.10');
  await supportHandler(request);

  assert.equal(secondState.rpcCalls[0].args.p_actor_hash, firstActorHash);
});

test('prefers a valid CF-Connecting-IP over other forwarding headers', async () => {
  const state = createHarness();

  await supportHandler(requestFor({
    name: 'Invitada',
    email: 'guest@example.com',
    message: 'Mensaje con Cloudflare',
  }, {
    cfConnectingIp: '203.0.113.40',
    forwardedFor: '192.0.2.10, 203.0.113.50',
    realIp: '203.0.113.60',
  }));

  assert.equal(
    state.rpcCalls[0].args.p_actor_hash,
    expectedActorHash('ip:203.0.113.40'),
  );
});

test('falls back from invalid CF IP to safe X-Forwarded-For, then X-Real-IP', async () => {
  const forwardedState = createHarness();
  await supportHandler(requestFor({
    name: 'Invitada',
    email: 'guest@example.com',
    message: 'Fallback XFF',
  }, {
    cfConnectingIp: 'not-an-ip',
    forwardedFor: '192.0.2.200, 2001:db8::10',
    realIp: '203.0.113.70',
  }));
  assert.equal(
    forwardedState.rpcCalls[0].args.p_actor_hash,
    expectedActorHash('ip:2001:db8::10'),
  );

  const realIpState = createHarness();
  await supportHandler(requestFor({
    name: 'Invitada',
    email: 'guest@example.com',
    message: 'Fallback real IP',
  }, {
    cfConnectingIp: 'not-an-ip',
    forwardedFor: '192.0.2.200, also-not-an-ip',
    realIp: '203.0.113.70',
  }));
  assert.equal(
    realIpState.rpcCalls[0].args.p_actor_hash,
    expectedActorHash('ip:203.0.113.70'),
  );
});

test('rejects invalid IP header values without selecting a valid spoofed prefix', async () => {
  const state = createHarness();

  await supportHandler(requestFor({
    name: 'Invitada',
    email: 'guest@example.com',
    message: 'Headers invalidos',
  }, {
    cfConnectingIp: '999.999.999.999',
    forwardedFor: '203.0.113.80, attacker-controlled.invalid',
    realIp: '300.1.1.1',
  }));

  assert.equal(
    state.rpcCalls[0].args.p_actor_hash,
    expectedActorHash('ip:unknown'),
  );
});

test('rejects an invalid user JWT instead of downgrading it to a guest', async () => {
  const state = createHarness({
    user: authenticatedUser,
    authError: { code: 'invalid_jwt' },
  });

  const result = await responseBody(await supportHandler(requestFor({
    name: 'Guest fallback',
    email: 'guest@example.com',
    message: 'JWT invalido',
  }, { authToken: 'invalid-user-jwt' })));

  assert.equal(result.status, 401);
  assert.equal(state.authCalls, 1);
  assert.equal(state.adminClientCreates, 0);
  assert.equal(state.rpcCalls.length, 0);
  assert.equal(state.insertCalls.length, 0);
});

test('rejects a forged user_id before rate limiting or insertion', async () => {
  const state = createHarness({ user: authenticatedUser });

  const result = await responseBody(await supportHandler(requestFor({
    user_id: 'user-b',
    message: 'Intento de suplantacion',
  }, { withAuth: true })));

  assert.equal(result.status, 400);
  assert.equal(state.adminClientCreates, 0);
  assert.equal(state.rpcCalls.length, 0);
  assert.equal(state.insertCalls.length, 0);
});

test('rejects an invalid guest email', async () => {
  const state = createHarness();

  const result = await responseBody(await supportHandler(requestFor({
    name: 'Invitada',
    email: 'not-an-email',
    message: 'Hola',
  })));

  assert.equal(result.status, 400);
  assert.equal(state.adminClientCreates, 0);
  assert.equal(state.rpcCalls.length, 0);
  assert.equal(state.insertCalls.length, 0);
});

test('rejects an overlong name', async () => {
  const state = createHarness();

  const result = await responseBody(await supportHandler(requestFor({
    name: 'n'.repeat(101),
    email: 'guest@example.com',
    message: 'Hola',
  })));

  assert.equal(result.status, 400);
  assert.equal(state.rpcCalls.length, 0);
  assert.equal(state.insertCalls.length, 0);
});

test('rejects an overlong message', async () => {
  const state = createHarness();

  const result = await responseBody(await supportHandler(requestFor({
    name: 'Invitada',
    email: 'guest@example.com',
    message: 'm'.repeat(4001),
  })));

  assert.equal(result.status, 400);
  assert.equal(state.rpcCalls.length, 0);
  assert.equal(state.insertCalls.length, 0);
});

test('returns 429 and does not insert when the rate limit is exhausted', async () => {
  const state = createHarness({ rateAllowed: false });

  const result = await responseBody(await supportHandler(requestFor({
    name: 'Invitada',
    email: 'guest@example.com',
    message: 'Otro mensaje',
  })));

  assert.equal(result.status, 429);
  assert.equal(state.rpcCalls.length, 1);
  assert.equal(state.insertCalls.length, 0);
});

test('fails closed when the rate limiter cannot be checked', async () => {
  const state = createHarness({ rateError: { code: 'database_error' } });

  const result = await responseBody(await supportHandler(requestFor({
    name: 'Invitada',
    email: 'guest@example.com',
    message: 'Mensaje durante una falla',
  })));

  assert.equal(result.status, 503);
  assert.equal(state.rpcCalls.length, 1);
  assert.equal(state.insertCalls.length, 0);
});

test('rejects attempts to set admin_response', async () => {
  const state = createHarness();

  const result = await responseBody(await supportHandler(requestFor({
    name: 'Invitada',
    email: 'guest@example.com',
    message: 'Hola',
    admin_response: 'Respuesta falsa',
  })));

  assert.equal(result.status, 400);
  assert.equal(state.rpcCalls.length, 0);
  assert.equal(state.insertCalls.length, 0);
});

test('rejects attempts to set status', async () => {
  const state = createHarness();

  const result = await responseBody(await supportHandler(requestFor({
    name: 'Invitada',
    email: 'guest@example.com',
    message: 'Hola',
    status: 'resolved',
  })));

  assert.equal(result.status, 400);
  assert.equal(state.rpcCalls.length, 0);
  assert.equal(state.insertCalls.length, 0);
});

test('RLS still prevents user A from reading user B messages', () => {
  const originalMigration = readFileSync(
    new URL('../../migrations/20251223223104_add_support_and_credentials_v2.sql', import.meta.url),
    'utf8',
  );
  const guestSelectMigration = readFileSync(
    new URL('../../migrations/20260811033801_20260811120000_fix_support_messages_select_policy.sql', import.meta.url),
    'utf8',
  );
  const currentMigration = readFileSync(
    new URL('../../migrations/20260812000100_secure_support_message_submission.sql', import.meta.url),
    'utf8',
  );

  assert.match(
    originalMigration,
    /CREATE POLICY "Users can view own support messages"[\s\S]*?USING \(auth\.uid\(\) = user_id\);/,
  );
  assert.match(
    guestSelectMigration,
    /user_id IS NULL[\s\S]*?user_email = \(auth\.jwt\(\) ->> 'email'\)/,
  );
  assert.doesNotMatch(currentMigration, /DROP POLICY IF EXISTS "Users can view own support messages"/);
  assert.doesNotMatch(
    currentMigration,
    /DROP POLICY IF EXISTS "Users can view messages without user_id if they match email"/,
  );
});

test('Admin read and response flow remains available', () => {
  const adminPolicyMigration = readFileSync(
    new URL('../../migrations/20260805000100_admin_and_secure_checkout.sql', import.meta.url),
    'utf8',
  );
  const adminGrantMigration = readFileSync(
    new URL('../../migrations/20260806201626_restore_admin_support_message_update_grant.sql', import.meta.url),
    'utf8',
  );
  const currentMigration = readFileSync(
    new URL('../../migrations/20260812000100_secure_support_message_submission.sql', import.meta.url),
    'utf8',
  );
  const adminComponent = readFileSync(new URL('../../../src/pages/Admin.tsx', import.meta.url), 'utf8');

  assert.match(
    adminPolicyMigration,
    /CREATE POLICY "Admins can manage support messages"[\s\S]*?FOR ALL[\s\S]*?public\.is_admin\(\)/,
  );
  assert.match(
    adminGrantMigration,
    /GRANT UPDATE \(admin_response, status, updated_at\)[\s\S]*?TO authenticated/,
  );
  assert.doesNotMatch(currentMigration, /DROP POLICY IF EXISTS "Admins can manage support messages"/);
  assert.match(
    currentMigration,
    /BEFORE INSERT OR UPDATE OF user_name, user_email, message/,
  );
  assert.match(adminComponent, /from\('support_messages'\)\.select\('\*'\)/);
  assert.match(
    adminComponent,
    /\.update\(\{[\s\S]*?admin_response: response,[\s\S]*?status: 'resolved',[\s\S]*?updated_at:/,
  );
});

test('browser roles cannot insert directly after the migration', () => {
  const migration = readFileSync(
    new URL('../../migrations/20260812000100_secure_support_message_submission.sql', import.meta.url),
    'utf8',
  );

  assert.match(migration, /REVOKE INSERT ON public\.support_messages FROM anon, authenticated;/);
  assert.match(
    migration,
    /REVOKE INSERT \(user_id, user_email, user_name, message, created_at, updated_at\)[\s\S]*?FROM anon, authenticated;/,
  );
  assert.match(migration, /GRANT INSERT ON public\.support_messages TO service_role;/);
});

test('rate limiter is atomic and callable only by service_role', () => {
  const migration = readFileSync(
    new URL('../../migrations/20260812000100_secure_support_message_submission.sql', import.meta.url),
    'utf8',
  );

  assert.match(migration, /PERFORM pg_advisory_xact_lock\(hashtextextended\(p_actor_hash, 0\)\);/);
  assert.match(
    migration,
    /IF v_request_count >= p_max_requests THEN[\s\S]*?RETURN false;/,
  );
  assert.match(migration, /SET request_count = request_count \+ 1/);
  assert.match(
    migration,
    /REVOKE EXECUTE ON FUNCTION public\.check_support_message_rate_limit\(text, integer, integer\)[\s\S]*?FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.check_support_message_rate_limit\(text, integer, integer\)[\s\S]*?TO service_role;/,
  );
});

test('only send-support-message disables gateway JWT verification', () => {
  const config = readFileSync(new URL('../../config.toml', import.meta.url), 'utf8');
  const disabledFunctions = [...config.matchAll(
    /^\[functions\.([^\]]+)\]\s*\r?\nverify_jwt\s*=\s*false\s*$/gm,
  )].map((match) => match[1]);

  assert.deepEqual(disabledFunctions, ['send-support-message']);
});
