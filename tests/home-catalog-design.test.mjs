import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const homeSource = readSource('src/pages/Home.tsx');
const catalogSource = readSource('src/pages/Catalog.tsx');
const appSource = readSource('src/App.tsx');
const serviceCardSource = readSource('src/components/ServiceCard.tsx');

test('catalog page exists and is registered in the existing App navigation', () => {
  assert.equal(existsSync(new URL('../src/pages/Catalog.tsx', import.meta.url)), true);
  assert.match(appSource, /Page\s*=\s*[^;]*['"]catalog['"]/s);
  assert.match(appSource, /case ['"]catalog['"]:/);
  assert.match(appSource, /<Catalog\s+onOpenAuth=/);
});

test('home includes the approved hero and navigation targets', () => {
  assert.match(homeSource, /Avanza en tus estudios con el apoyo que necesitas/);
  assert.match(homeSource, /Explorar servicios/);
  assert.match(homeSource, /onNavigate\(['"]catalog['"]\)/);
  assert.match(homeSource, /id="how-it-works"/);
});

test('home and catalog load real active services and categories from Supabase', () => {
  for (const source of [homeSource, catalogSource]) {
    assert.match(source, /supabase\.from\(['"]categories['"]\)\.select\(['"]\*['"]\)/);
    assert.match(source, /supabase\.from\(['"]services['"]\)\.select\(['"]\*['"]\)\.eq\(['"]is_active['"],\s*true\)/);
    assert.doesNotMatch(source, /const\s+services\s*=\s*\[/);
  }
});

test('catalog provides client-side search, category filtering and a dynamic result count', () => {
  assert.match(catalogSource, /<SearchBar/);
  assert.match(catalogSource, /service\.name/);
  assert.match(catalogSource, /service\.description/);
  assert.match(catalogSource, /category\?\.name/);
  assert.match(catalogSource, /categoryFilter/);
  assert.match(catalogSource, /filteredServices\.length/);
  assert.match(catalogSource, /<EmptyState/);
});

test('service card stays presentational and displays database-backed service fields', () => {
  assert.doesNotMatch(serviceCardSource, /supabase|\.from\(/i);
  assert.match(serviceCardSource, /service\.name/);
  assert.match(serviceCardSource, /service\.description/);
  assert.match(serviceCardSource, /service\.price/);
  assert.match(serviceCardSource, /onSelect\(service\)/);
});

test('existing authentication, customization and cart flow remain connected', () => {
  for (const source of [homeSource, catalogSource]) {
    assert.match(source, /if \(!user\)[\s\S]*?onOpenAuth\(\)/);
    assert.match(source, /<ServiceCustomizationModal/);
    assert.match(source, /addToCart\(/);
  }
});

test('approved Stripe copy is exact and prohibited sample claims are absent', () => {
  const newViewSource = [homeSource, catalogSource, serviceCardSource].join('\n');
  assert.match(homeSource, /Pago procesado de forma segura con Stripe/);
  for (const prohibited of [/PayPal/i, /CFDI/i, /24\/7/i, /500\+/, /98%/]) {
    assert.doesNotMatch(newViewSource, prohibited);
  }
});

test('new Home and Catalog layouts are fluid rather than fixed to the reference width', () => {
  for (const source of [homeSource, catalogSource]) {
    assert.doesNotMatch(source, /(?:width|w-)\s*[:=]?\s*\[?390px/i);
    assert.doesNotMatch(source, /style=\{\{[^}]*width:\s*['"]390px['"]/i);
  }
});
