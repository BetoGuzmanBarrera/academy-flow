import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const headerSource = readSource('src/components/Header.tsx');
const homeSource = readSource('src/pages/Home.tsx');
const modalSource = readSource('src/components/ui/Modal.tsx');

test('sticky header uses an opaque surface without the mobile blur artifact', () => {
  assert.match(headerSource, /sticky top-0 z-40[^"\n]*bg-academy-surface/);
  assert.doesNotMatch(headerSource, /bg-academy-surface\/95|backdrop-blur/);
});

test('mobile navigation reuses the accessible Drawer behavior', () => {
  assert.match(headerSource, /<Drawer[\s\S]*?open=\{mobileMenuOpen\}[\s\S]*?onClose=/);
  assert.match(headerSource, /aria-controls="mobile-navigation"/);
  assert.match(headerSource, /aria-haspopup="dialog"/);
  assert.match(headerSource, /<nav id="mobile-navigation" aria-label="Navegación móvil">/);
});

test('the final Home CTA keeps visible text and the existing catalog navigation', () => {
  const ctaStart = homeSource.indexOf('Encuentra el apoyo adecuado para tu solicitud');
  const ctaSection = homeSource.slice(ctaStart, ctaStart + 700);

  assert.notEqual(ctaStart, -1);
  assert.match(ctaSection, /<Button variant="secondary"/);
  assert.match(ctaSection, /onClick=\{\(\) => onNavigate\('catalog'\)\}/);
  assert.match(ctaSection, />Explorar servicios<\/Button>/);
  assert.doesNotMatch(ctaSection, /text-white/);
});

test('Modal keeps its close control visible while long content scrolls internally', () => {
  assert.match(modalSource, /flex max-h-\[calc\(100vh-2rem\)\][^'\n]*flex-col overflow-hidden/);
  assert.match(modalSource, /shrink-0 items-center justify-between/);
  assert.match(modalSource, /min-h-0 overflow-y-auto p-af-6/);
  assert.match(modalSource, /aria-label="Cerrar diálogo"/);
});
