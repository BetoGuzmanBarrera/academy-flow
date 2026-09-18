import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const uiDirectory = new URL('../src/components/ui/', import.meta.url);
const readUi = (fileName) => readFileSync(new URL(fileName, uiDirectory), 'utf8');

const publicComponents = [
  'Alert',
  'Badge',
  'Button',
  'Card',
  'Checkbox',
  'Drawer',
  'EmptyState',
  'Input',
  'Modal',
  'Pagination',
  'Radio',
  'SearchBar',
  'Select',
  'StatCard',
  'Table',
  'Tabs',
  'Textarea',
];

test('the design system exposes every required public primitive', () => {
  const indexSource = readUi('index.ts');
  for (const component of publicComponents) {
    assert.equal(existsSync(new URL(`${component}.tsx`, uiDirectory)), true, `${component}.tsx must exist`);
    assert.match(indexSource, new RegExp(`export \\* from ['\"]\\./${component}['\"]`));
  }
});

test('semantic design tokens are defined in CSS and mapped in Tailwind', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  const tailwind = readFileSync(new URL('../tailwind.config.js', import.meta.url), 'utf8');
  for (const token of ['background', 'surface', 'primary', 'text', 'border', 'success', 'warning', 'danger']) {
    assert.match(css, new RegExp(`--af-color-${token}:`));
  }
  for (const scale of ['fontSize', 'spacing', 'borderRadius', 'boxShadow']) {
    assert.match(tailwind, new RegExp(`${scale}:`));
  }
  assert.match(tailwind, /var\(--af-color-primary\)/);
});

test('button variants and state semantics are part of the primitive contract', () => {
  const source = readUi('Button.tsx');
  for (const variant of ['primary', 'secondary', 'destructive', 'ghost']) {
    assert.match(source, new RegExp(`['\"]?${variant}['\"]?`));
  }
  assert.match(source, /aria-busy/);
  assert.match(source, /disabled=\{isDisabled\}/);
  assert.match(source, /leadingIcon/);
  assert.match(source, /trailingIcon/);
});

test('badges and alerts expose their complete semantic variant sets', () => {
  const badgeSource = readUi('Badge.tsx');
  const alertSource = readUi('Alert.tsx');
  for (const variant of ['primary', 'success', 'warning', 'danger', 'neutral']) {
    assert.match(badgeSource, new RegExp(`['\"]?${variant}['\"]?`));
  }
  for (const variant of ['info', 'success', 'warning', 'error']) {
    assert.match(alertSource, new RegExp(`['\"]?${variant}['\"]?`));
  }
  assert.match(alertSource, /role=\{role\}/);
});

test('form primitives connect labels, descriptions and validation errors', () => {
  for (const file of ['Input.tsx', 'Textarea.tsx', 'Select.tsx', 'Checkbox.tsx', 'Radio.tsx']) {
    const source = readUi(file);
    assert.match(source, /aria-invalid/);
    assert.match(source, /aria-describedby/);
  }
  assert.match(readUi('Textarea.tsx'), /typeof maxLength === ['\"]number['\"]/);
  assert.match(readUi('Checkbox.tsx'), /type="checkbox"/);
  assert.match(readUi('Radio.tsx'), /type="radio"/);
});

test('modal and drawer implement the required dialog behavior', () => {
  const dialogBehavior = readUi('useDialogBehavior.ts');
  for (const file of ['Modal.tsx', 'Drawer.tsx']) {
    const source = readUi(file);
    assert.match(source, /role="dialog"/);
    assert.match(source, /aria-modal="true"/);
    assert.match(source, /useDialogBehavior/);
    assert.match(source, /aria-label="Cerrar/);
  }
  assert.match(dialogBehavior, /event\.key === ['\"]Escape['\"]/);
  assert.match(dialogBehavior, /event\.key !== ['\"]Tab['\"]/);
  assert.match(dialogBehavior, /document\.body\.style\.overflow = ['\"]hidden['\"]/);
  assert.match(dialogBehavior, /removeEventListener/);
  assert.match(dialogBehavior, /previouslyFocused\?\.focus\(\)/);
});

test('tabs expose ARIA semantics and keyboard navigation', () => {
  const source = readUi('Tabs.tsx');
  for (const semantic of ['tablist', 'tab', 'tabpanel']) {
    assert.match(source, new RegExp(`role=['\"]${semantic}['\"]`));
  }
  for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
    assert.match(source, new RegExp(key));
  }
});

test('pagination is a labelled navigation with current-page and touch-target semantics', () => {
  const source = readUi('Pagination.tsx');
  assert.match(source, /<nav aria-label=\{ariaLabel\}/);
  assert.match(source, /aria-current=\{item === page \? ['\"]page['\"] : undefined\}/);
  assert.match(source, /min-h-touch/);
  assert.match(source, /min-w-touch/);
  assert.match(source, /ellipsis/);
});

test('the foundational design system does not introduce business-specific UI', () => {
  const combinedSource = publicComponents.map((component) => readUi(`${component}.tsx`)).join('\n');
  assert.doesNotMatch(combinedSource, /PayPal/i);
  assert.doesNotMatch(combinedSource, /CFDI/i);
  assert.doesNotMatch(combinedSource, /Supabase|Stripe|order_id|credential/i);
});
