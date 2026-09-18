import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const cartContextSource = readSource('src/contexts/CartContext.tsx');
const activitySource = readSource('src/components/AdminActivityHistory.tsx');
const adminSource = readSource('src/pages/Admin.tsx');
const customizationSource = readSource('src/components/ServiceCustomizationModal.tsx');
const modalSource = readSource('src/components/ui/Modal.tsx');
const dialogBehaviorSource = readSource('src/components/ui/useDialogBehavior.ts');
const referralsSource = readSource('src/pages/Referrals.tsx');

test('all three audited loaders clear loading in finally blocks', () => {
  for (const source of [cartContextSource, activitySource, adminSource]) {
    assert.match(source, /setLoading\(true\);[\s\S]*?try\s*\{/);
    assert.match(source, /finally\s*\{[\s\S]*?setLoading\(false\);/);
  }
});

test('loader fixes preserve their established Supabase queries', () => {
  assert.match(cartContextSource, /\.from\(['"]cart_items['"]\)[\s\S]*?service:services\(\*\)[\s\S]*?\.eq\(['"]user_id['"],\s*userId\)/);
  assert.match(activitySource, /\.from\(['"]admin_activity_log['"]\)[\s\S]*?\.limit\(HISTORY_LIMIT\)/);
  assert.match(activitySource, /\.from\(['"]order_status_history['"]\)[\s\S]*?\.limit\(HISTORY_LIMIT\)/);
  assert.match(adminSource, /supabase\.from\(['"]categories['"]\)\.select\(['"]\*['"]\)\.order\(['"]name['"]\)/);
  assert.match(adminSource, /supabase\.from\(['"]services['"]\)\.select\(['"]\*['"]\)\.order\(['"]created_at['"],\s*\{\s*ascending:\s*false\s*\}\)/);
  assert.match(adminSource, /supabase\.from\(['"]support_messages['"]\)\.select\(['"]\*['"]\)\.order\(['"]created_at['"],\s*\{\s*ascending:\s*false\s*\}\)/);
});

test('service customization uses the accessible design-system dialog behavior', () => {
  assert.match(customizationSource, /<Modal[\s\S]*?title=\{service\.name\}[\s\S]*?dismissible=\{!submitting\}/);
  assert.match(modalSource, /role="dialog"/);
  assert.match(modalSource, /aria-modal="true"/);
  assert.match(modalSource, /aria-labelledby=\{title \? titleId : undefined\}/);
  assert.match(modalSource, /useDialogBehavior\(open,\s*onClose,\s*dismissible\)/);
  assert.match(dialogBehaviorSource, /event\.key === ['"]Escape['"] && dismissible/);
  assert.match(dialogBehaviorSource, /event\.key !== ['"]Tab['"]/);
  assert.match(dialogBehaviorSource, /previouslyFocused\?\.focus\(\)/);
  assert.match(dialogBehaviorSource, /document\.body\.style\.overflow = ['"]hidden['"]/);
});

test('service customization retains callbacks and gives every custom control an accessible name', () => {
  assert.match(customizationSource, /validateDetails\(service\.name,\s*category\.name,\s*details\)/);
  assert.match(customizationSource, /await onConfirm\(details,\s*quantity\)/);
  assert.match(customizationSource, /htmlFor=\{fieldId\}/);
  assert.match(customizationSource, /id=\{fieldId\}/);
  assert.match(customizationSource, /aria-label="Disminuir cantidad"/);
  assert.match(customizationSource, /aria-label="Aumentar cantidad"/);
  assert.match(customizationSource, /role="group" aria-labelledby="service-customization-quantity-label"/);
  assert.match(customizationSource, /role="alert"/);
});

test('referral loading cancels state updates after unmount without changing its queries', () => {
  assert.match(referralsSource, /let cancelled = false/);
  assert.match(referralsSource, /if \(cancelled\) return/);
  assert.match(referralsSource, /if \(!cancelled && uses\)/);
  assert.match(referralsSource, /finally\s*\{\s*if \(!cancelled\) setLoading\(false\);\s*\}/);
  assert.match(referralsSource, /return \(\) => \{\s*cancelled = true;\s*\}/);
  assert.match(referralsSource, /\.from\(['"]referral_codes['"]\)[\s\S]*?\.eq\(['"]user_id['"],\s*user\.id\)[\s\S]*?\.maybeSingle\(\)/);
  assert.match(referralsSource, /\.from\(['"]referral_uses['"]\)[\s\S]*?\.eq\(['"]referral_code_id['"],\s*code\.id\)[\s\S]*?\.order\(['"]created_at['"],\s*\{\s*ascending:\s*false\s*\}\)/);
});
