import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAdminSupportStatusUpdate,
  emptyAdminSupportFilters,
  filterAdminSupportMessages,
  hasActiveAdminSupportFilters,
} from '../src/lib/adminSupportFilters.ts';

const messages = [
  {
    message: 'Necesito ayuda con mi acceso a Coursera',
    status: 'pending',
    user_id: 'a1111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    user_email: 'ana@example.com',
    user_name: 'Ana López',
  },
  {
    message: 'Mi orden aún no aparece',
    status: 'in_progress',
    user_id: 'b2222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    user_email: 'betO@example.com',
    user_name: 'Beto Guzmán',
  },
  {
    message: 'Consulta resuelta',
    status: 'resolved',
    user_id: null,
    user_email: 'guest@example.com',
    user_name: 'Invitado',
  },
];

const filters = (overrides = {}) => ({ ...emptyAdminSupportFilters, ...overrides });

test('searches support messages by message content', () => {
  assert.deepEqual(filterAdminSupportMessages(messages, filters({ search: 'coursera' })), [messages[0]]);
});

test('searches by short user id', () => {
  assert.deepEqual(filterAdminSupportMessages(messages, filters({ search: 'b2222222' })), [messages[1]]);
});

test('searches by loaded customer name', () => {
  assert.deepEqual(filterAdminSupportMessages(messages, filters({ search: 'lópez' })), [messages[0]]);
});

test('searches by loaded customer email without case sensitivity', () => {
  assert.deepEqual(filterAdminSupportMessages(messages, filters({ search: '  BETO@EXAMPLE  ' })), [messages[1]]);
});

test('filters by each real support status', () => {
  assert.deepEqual(filterAdminSupportMessages(messages, filters({ status: 'pending' })), [messages[0]]);
  assert.deepEqual(filterAdminSupportMessages(messages, filters({ status: 'in_progress' })), [messages[1]]);
  assert.deepEqual(filterAdminSupportMessages(messages, filters({ status: 'resolved' })), [messages[2]]);
});

test('combines search and status filters', () => {
  assert.deepEqual(
    filterAdminSupportMessages(messages, filters({ search: 'orden', status: 'in_progress' })),
    [messages[1]],
  );
});

test('empty filters restore every message and result count', () => {
  const result = filterAdminSupportMessages(messages, emptyAdminSupportFilters);

  assert.deepEqual(result, messages);
  assert.equal(result.length, 3);
  assert.equal(hasActiveAdminSupportFilters(emptyAdminSupportFilters), false);
});

test('active filters support an empty result state', () => {
  const activeFilters = filters({ search: 'sin coincidencias' });

  assert.equal(hasActiveAdminSupportFilters(activeFilters), true);
  assert.equal(filterAdminSupportMessages(messages, activeFilters).length, 0);
});

test('filtering does not mutate the original list', () => {
  const before = structuredClone(messages);

  filterAdminSupportMessages(messages, filters({ status: 'resolved' }));

  assert.deepEqual(messages, before);
});

test('status changes use only the selected real status and update timestamp', () => {
  const updatedAt = new Date('2026-09-15T12:00:00.000Z');

  assert.deepEqual(buildAdminSupportStatusUpdate('in_progress', updatedAt), {
    status: 'in_progress',
    updated_at: '2026-09-15T12:00:00.000Z',
  });
});
