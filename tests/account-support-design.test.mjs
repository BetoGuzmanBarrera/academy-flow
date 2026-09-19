import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const accountSource = readSource('src/pages/Account.tsx');
const appSource = readSource('src/App.tsx');
const headerSource = readSource('src/components/Header.tsx');
const headerNavigationSource = readSource('src/components/header/HeaderNavigation.tsx');
const supportSource = readSource('src/components/SupportChat.tsx');

test('Account exists and uses only the existing authenticated profile data', () => {
  assert.equal(existsSync(new URL('../src/pages/Account.tsx', import.meta.url)), true);
  assert.match(accountSource, /useAuth\(\)/);
  assert.match(accountSource, /profile\?\.first_name/);
  assert.match(accountSource, /profile\?\.last_name/);
  assert.match(accountSource, /user\.email/);
  assert.match(accountSource, /profile\?\.birth_date/);
});

test('Account remains read-only and delegates existing security and support actions', () => {
  assert.doesNotMatch(accountSource, /\.from\(['"]profiles['"]\)\s*\.update|auth\.updateUser/);
  assert.match(accountSource, /onClick=\{onOpenChangePassword\}/);
  assert.match(accountSource, /openSupportChat\(\)/);
  assert.match(accountSource, /onNavigate\(['"]orders['"]\)/);
  assert.match(accountSource, /onNavigate\(['"]referrals['"]\)/);
});

test('App registers Account in the existing page navigation without a router', () => {
  assert.match(appSource, /['"]account['"]/);
  assert.match(appSource, /case ['"]account['"]:/);
  assert.match(appSource, /<Account/);
  assert.match(appSource, /onNavigate=\{handleNavigate\}/);
  assert.match(appSource, /onOpenChangePassword=\{\(\) => setIsChangePasswordOpen\(true\)\}/);
  assert.doesNotMatch(appSource, /react-router|BrowserRouter|createBrowserRouter/i);
});

test('Header exposes Mi cuenta in authenticated desktop and mobile navigation', () => {
  assert.match(headerSource, /<DesktopUserNavigation/);
  assert.match(headerSource, /<MobileNavigation/);
  const accountNavigationTargets = [...headerNavigationSource.matchAll(/onNavigate\(['"]account['"]\)/g)];
  assert.equal(accountNavigationTargets.length, 2);
  assert.ok((headerNavigationSource.match(/Mi cuenta/g) ?? []).length >= 2);
  assert.match(headerNavigationSource, /Referidos/);
  assert.match(headerNavigationSource, /Administración/);
  assert.match(headerNavigationSource, /Cambiar contraseña/);
  assert.match(headerNavigationSource, /Cerrar sesión/);
});

test('SupportChat preserves its event and authenticated message query', () => {
  assert.match(supportSource, /new CustomEvent\(['"]open-support-chat['"]\)/);
  assert.match(supportSource, /\.from\(['"]support_messages['"]\)/);
  assert.match(supportSource, /\.select\(['"]\*['"]\)/);
  assert.match(supportSource, /\.or\(/);
  assert.match(supportSource, /user_id\.eq\.\$\{userId\},and\(user_id\.is\.null,user_email\.eq\.\$\{userEmail\}\)/);
  assert.match(supportSource, /\.order\(['"]created_at['"],\s*\{\s*ascending:\s*true\s*\}\)/);
});

test('SupportChat clears a stale error before loading message history again', () => {
  const loadMessagesStart = supportSource.indexOf('const loadMessages');
  const messagesQueryStart = supportSource.indexOf(".from('support_messages')", loadMessagesStart);
  const loadMessagesPrefix = supportSource.slice(loadMessagesStart, messagesQueryStart);

  assert.notEqual(loadMessagesStart, -1);
  assert.notEqual(messagesQueryStart, -1);
  assert.match(
    loadMessagesPrefix,
    /setMessagesLoading\(true\);\s*setError\(''\);\s*try\s*\{/,
  );
});

test('SupportChat preserves the secure Edge Function and exact guest/auth payloads', () => {
  assert.match(supportSource, /supabase\.functions\.invoke<[\s\S]*?>\(['"]send-support-message['"]/);
  assert.match(supportSource, /\?\s*\{\s*message:\s*newMessage\s*\}/);
  assert.match(supportSource, /:\s*\{\s*name,\s*email,\s*message:\s*newMessage\s*\}/);
  assert.doesNotMatch(supportSource, /body:[\s\S]{0,220}\b(?:user_id|role|admin_response|status)\b/);
});

test('SupportChat retains guest field limits and a multiline message field', () => {
  assert.match(supportSource, /maxLength=\{100\}/);
  assert.match(supportSource, /maxLength=\{320\}/);
  assert.match(supportSource, /<Textarea[\s\S]*?maxLength=\{4000\}/);
  assert.match(supportSource, /if\s*\(!user\s*&&\s*\(!name\.trim\(\)\s*\|\|\s*!email\.trim\(\)\)\)/);
});

test('SupportChat uses accessible responsive primitives and real status values', () => {
  assert.match(supportSource, /aria-label="Abrir soporte"/);
  assert.match(supportSource, /<Drawer/);
  assert.match(supportSource, /side="right"/);
  assert.doesNotMatch(supportSource, /\bw-96\b/);
  for (const status of ['pending', 'in_progress', 'resolved']) {
    assert.match(supportSource, new RegExp(status + ':'));
  }
  assert.match(supportSource, /msg\.admin_response/);
  assert.match(supportSource, /msg\.created_at/);
});

test('Account and SupportChat expose no tokens, profile writes, or internal identifiers', () => {
  const customerUiSource = accountSource + '\n' + supportSource;
  assert.doesNotMatch(customerUiSource, /access_token|refresh_token|SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|sk_live_|whsec_/i);
  assert.doesNotMatch(accountSource, /\{\s*(?:user|profile)\.id\s*\}/);
  assert.doesNotMatch(supportSource, /\{\s*msg\.user_id\s*\}/);
  assert.doesNotMatch(customerUiSource, /(?:width|w-)\s*[:=]?\s*\[?390px/i);
});
