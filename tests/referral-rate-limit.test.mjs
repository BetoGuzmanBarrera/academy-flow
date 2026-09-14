import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(repoRoot, 'supabase', 'migrations');
const matchingMigrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('_rate_limit_referral_code_validation.sql'));

assert.equal(matchingMigrations.length, 1, 'expected exactly one referral rate-limit migration');

const migration = readFileSync(join(migrationsDir, matchingMigrations[0]), 'utf8');
const checkout = readFileSync(join(repoRoot, 'src', 'pages', 'Checkout.tsx'), 'utf8');
const ciWorkflow = readFileSync(join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
const secureOrderMigration = readFileSync(
  join(
    migrationsDir,
    '20260807013406_20260808010000_fix_create_secure_order_ambiguous_column.sql.sql',
  ),
  'utf8',
);

const functionStart = migration.indexOf(
  'CREATE OR REPLACE FUNCTION public.validate_referral_code(code_param text)',
);
assert.notEqual(functionStart, -1, 'validate_referral_code definition missing');
const functionSql = migration.slice(functionStart);

test('validate_referral_code preserves its contract and uses secure function settings', () => {
  assert.match(functionSql, /RETURNS TABLE\s*\(\s*valid boolean,\s*self_use boolean\s*\)/i);
  assert.match(functionSql, /LANGUAGE plpgsql\s+VOLATILE\s+SECURITY DEFINER/i);
  assert.match(functionSql, /SET search_path = ''/i);
});

test('authentication and rate limiting happen before the referral lookup', () => {
  const authPosition = functionSql.indexOf('v_user_id := auth.uid()');
  const authFailurePosition = functionSql.indexOf("RAISE EXCEPTION 'Authentication required'");
  const rateLimitPosition = functionSql.indexOf(
    'INSERT INTO public.referral_validation_rate_limits',
  );
  const referralLookupPosition = functionSql.indexOf('FROM public.referral_codes');

  assert.ok(authPosition >= 0);
  assert.ok(authFailurePosition > authPosition);
  assert.ok(rateLimitPosition > authFailurePosition);
  assert.ok(referralLookupPosition > rateLimitPosition);
});

test('the durable limiter table is private and has one checked row per user', () => {
  assert.match(
    migration,
    /CREATE TABLE public\.referral_validation_rate_limits\s*\([\s\S]*?user_id\s+uuid PRIMARY KEY[\s\S]*?window_started_at\s+timestamptz NOT NULL[\s\S]*?attempt_count\s+integer NOT NULL[\s\S]*?CHECK \(attempt_count >= 0\)/i,
  );
  assert.match(
    migration,
    /ALTER TABLE public\.referral_validation_rate_limits ENABLE ROW LEVEL SECURITY;/i,
  );
  assert.doesNotMatch(migration, /FORCE ROW LEVEL SECURITY/i);
  assert.doesNotMatch(migration, /CREATE POLICY/i);
  assert.match(
    migration,
    /REVOKE ALL PRIVILEGES\s+ON TABLE public\.referral_validation_rate_limits\s+FROM PUBLIC, anon, authenticated, service_role;/i,
  );
});

test('the fixed window allows 20 attempts and resets after ten minutes', () => {
  assert.match(
    functionSql,
    /window_started_at = CASE\s+WHEN limits\.window_started_at <= EXCLUDED\.window_started_at - interval '10 minutes'\s+THEN EXCLUDED\.window_started_at\s+ELSE limits\.window_started_at\s+END/i,
  );
  assert.match(
    functionSql,
    /attempt_count = CASE\s+WHEN limits\.window_started_at <= EXCLUDED\.window_started_at - interval '10 minutes'\s+THEN 1\s+ELSE limits\.attempt_count \+ 1\s+END/i,
  );
  assert.match(functionSql, /IF v_attempt_count > 20 THEN/i);
  assert.match(
    functionSql,
    /RAISE EXCEPTION 'Referral code validation rate limit exceeded'/i,
  );
  assert.doesNotMatch(functionSql, /\bEXCEPTION\s+WHEN\b/i);
});

test('concurrent attempts use a single atomic UPSERT instead of SELECT then UPDATE', () => {
  const referralLookupPosition = functionSql.indexOf('FROM public.referral_codes');
  const limiterSql = functionSql.slice(0, referralLookupPosition);

  assert.match(
    limiterSql,
    /INSERT INTO public\.referral_validation_rate_limits[\s\S]*?ON CONFLICT \(user_id\) DO UPDATE[\s\S]*?RETURNING attempt_count INTO v_attempt_count;/i,
  );
  assert.doesNotMatch(
    limiterSql,
    /SELECT[\s\S]*?FROM public\.referral_validation_rate_limits/i,
  );
});

test('only authenticated and service_role can execute the validation RPC', () => {
  assert.match(
    migration,
    /REVOKE EXECUTE ON FUNCTION public\.validate_referral_code\(text\)\s+FROM PUBLIC;/i,
  );
  assert.match(
    migration,
    /REVOKE EXECUTE ON FUNCTION public\.validate_referral_code\(text\)\s+FROM anon;/i,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.validate_referral_code\(text\)\s+TO authenticated;/i,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.validate_referral_code\(text\)\s+TO service_role;/i,
  );
});

test('checkout handles rate limiting without changing normal referral messages', () => {
  const rateLimitMessage =
    'Demasiados intentos. Espera unos minutos antes de probar otro código.';
  const rateLimitPosition = checkout.indexOf(
    "error?.message.includes('Referral code validation rate limit exceeded')",
  );
  const genericErrorPosition = checkout.indexOf('if (error || !data?.valid)');

  assert.ok(rateLimitPosition >= 0);
  assert.ok(genericErrorPosition > rateLimitPosition);
  assert.match(checkout, new RegExp(rateLimitMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(checkout, /Código de referido inválido/);
  assert.match(checkout, /No puedes usar tu propio código de referido/);
});

test('secure order creation still revalidates codes and records uses server-side', () => {
  assert.match(
    secureOrderMigration,
    /FROM public\.referral_codes\s+WHERE code = normalized_referral;/i,
  );
  assert.match(secureOrderMigration, /IF referral_owner = p_user_id THEN/i);
  assert.match(secureOrderMigration, /INSERT INTO public\.referral_uses/i);
});

test('CI runs the referral rate-limit regression tests', () => {
  assert.match(ciWorkflow, /node --test tests\/referral-rate-limit\.test\.mjs/);
});
