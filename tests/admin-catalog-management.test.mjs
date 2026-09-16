import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  getAdminServiceStatusLabel,
  replaceAdminService,
  runCatalogMutationOnce,
  serviceToAdminDraft,
  validateAdminServiceDraft,
} from '../src/lib/adminCatalog.ts';

const adminSource = readFileSync(new URL('../src/pages/Admin.tsx', import.meta.url), 'utf8');
const secureCheckoutMigration = readFileSync(
  new URL(
    '../supabase/migrations/20260811050323_20260811140000_case_insensitive_category_validation.sql.sql',
    import.meta.url,
  ),
  'utf8',
);

const service = {
  id: 'service-1',
  name: 'Coursera Excel',
  description: 'Curso completo',
  price: 499.5,
  category_id: 'category-1',
  is_active: true,
  created_at: '2026-09-15T00:00:00.000Z',
};

const validDraft = {
  name: ' Coursera Excel ',
  description: ' Curso completo ',
  price: '499.50',
  categoryId: 'category-1',
  isActive: false,
};

test('validates and normalizes every persisted service field', () => {
  assert.deepEqual(validateAdminServiceDraft(validDraft), {
    valid: true,
    payload: {
      name: 'Coursera Excel',
      description: 'Curso completo',
      price: 499.5,
      category_id: 'category-1',
      is_active: false,
    },
  });
});

test('rejects empty, non-finite, negative, and over-precision prices', () => {
  for (const price of ['', 'NaN', 'Infinity', '-1', '10.001', '1e2']) {
    const result = validateAdminServiceDraft({ ...validDraft, price });
    assert.equal(result.valid, false, `expected ${price || '<empty>'} to be rejected`);
  }

  assert.equal(validateAdminServiceDraft({ ...validDraft, price: '0' }).valid, true);
  assert.equal(validateAdminServiceDraft({ ...validDraft, price: '10.1' }).valid, true);
  assert.equal(validateAdminServiceDraft({ ...validDraft, price: '10.10' }).valid, true);
});

test('requires a service name and category', () => {
  assert.equal(validateAdminServiceDraft({ ...validDraft, name: '   ' }).valid, false);
  assert.equal(validateAdminServiceDraft({ ...validDraft, categoryId: '' }).valid, false);
});

test('editing uses an isolated draft so cancelling cannot mutate the service list', () => {
  const original = structuredClone(service);
  const draft = serviceToAdminDraft(service);

  draft.name = 'Nombre no guardado';
  draft.price = '1.00';
  draft.isActive = false;

  assert.deepEqual(service, original);
  assert.notEqual(draft.name, service.name);
});

test('a successful update replaces only the matching service without mutating the list', () => {
  const second = { ...service, id: 'service-2', name: 'ALEKS' };
  const original = [service, second];
  const updated = { ...service, name: 'Coursera actualizado', is_active: false };
  const result = replaceAdminService(original, updated);

  assert.deepEqual(result, [updated, second]);
  assert.deepEqual(original, [service, second]);
  assert.notEqual(result, original);
});

test('active and inactive services have explicit status labels', () => {
  assert.equal(getAdminServiceStatusLabel(true), 'Activo');
  assert.equal(getAdminServiceStatusLabel(false), 'Inactivo');
  assert.match(adminSource, /getAdminServiceStatusLabel\(service\.is_active\)/);
});

test('the mutation lock prevents duplicate concurrent submissions', async () => {
  const lock = { current: false };
  let calls = 0;
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });

  const mutation = async () => {
    calls += 1;
    await blocked;
    return 'saved';
  };

  const first = runCatalogMutationOnce(lock, mutation);
  const second = runCatalogMutationOnce(lock, mutation);

  assert.equal(await second, null);
  assert.equal(calls, 1);
  release();
  assert.equal(await first, 'saved');
  assert.equal(lock.current, false);
});

test('the mutation lock is released after an error so the admin can retry', async () => {
  const lock = { current: false };

  await assert.rejects(
    runCatalogMutationOnce(lock, async () => {
      throw new Error('request failed');
    }),
    /request failed/,
  );

  assert.equal(lock.current, false);
  assert.equal(await runCatalogMutationOnce(lock, async () => 'retried'), 'retried');
});

test('the UI saves through the existing services update and no longer deletes services', () => {
  assert.match(adminSource, /\.from\('services'\)\s*\.update\(validation\.payload\)/);
  assert.match(adminSource, />\s*Editar\s*</);
  assert.match(adminSource, />\s*Cancelar\s*</);
  assert.match(adminSource, /'Guardando…'/);
  assert.match(adminSource, /No hay servicios registrados todavía\./);
  assert.doesNotMatch(adminSource, /\.from\('services'\)\.delete\(/);
  assert.doesNotMatch(adminSource, /handleDeleteService/);
});

test('server-side checkout pricing rejects inactive services', () => {
  assert.match(secureCheckoutMigration, /sum\(s\.price \* ci\.quantity\)/);
  assert.match(secureCheckoutMigration, /INSERT INTO public\.order_items[\s\S]*?s\.price/);
  assert.ok((secureCheckoutMigration.match(/s\.is_active = true/g) ?? []).length >= 2);
});
