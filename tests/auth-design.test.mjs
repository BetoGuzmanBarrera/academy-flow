import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const authSource = readSource('src/components/AuthModal.tsx');
const changeSource = readSource('src/components/ChangePasswordModal.tsx');
const resetSource = readSource('src/pages/ResetPassword.tsx');
const turnstileSource = readSource('src/components/Turnstile.tsx');
const validationSource = readSource('src/lib/passwordValidation.ts');
const authSources = [authSource, changeSource, resetSource, turnstileSource, validationSource];

test('AuthModal preserves signIn with the CAPTCHA token', () => {
  assert.match(authSource, /signIn\(email,\s*password,\s*\{\s*captchaToken\s*\}\)/);
  assert.match(authSource, /Correo o contraseña incorrectos\./);
});

test('AuthModal preserves signUp metadata and the CAPTCHA token', () => {
  assert.match(authSource, /signUp\([\s\S]*?email,[\s\S]*?password,[\s\S]*?\{\s*firstName,\s*lastName,\s*birthDate\s*\},[\s\S]*?\{\s*captchaToken\s*\}/);
});

test('AuthModal preserves Turnstile callbacks and reset behavior', () => {
  assert.match(authSource, /<Turnstile/);
  assert.match(authSource, /onToken=\{handleCaptchaToken\}/);
  assert.match(authSource, /onError=\{handleCaptchaError\}/);
  assert.match(authSource, /onExpire=\{handleCaptchaExpire\}/);
  assert.match(authSource, /resetSignal=\{captchaResetSignal\}/);
  assert.match(turnstileSource, /const SCRIPT_SRC = 'https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit'/);
});

test('missing or incomplete CAPTCHA never enables auth submission', () => {
  assert.match(authSource, /captchaValid\s*=\s*hasSiteKey\s*&&\s*captchaToken\.length\s*>\s*0\s*&&\s*!captchaError/);
  assert.match(authSource, /if\s*\(!captchaValid\)/);
  assert.match(authSource, /disabled=\{!captchaValid/);
});

test('password recovery preserves resetPasswordForEmail and its redirect URL', () => {
  assert.match(authSource, /supabase\.auth\.resetPasswordForEmail\(email/);
  assert.match(authSource, /redirectTo:\s*`\$\{window\.location\.origin\}\?reset-password=true`/);
  assert.match(authSource, /captchaToken/);
});

test('anti-enumeration messages remain neutral and unchanged', () => {
  assert.match(authSource, /Si ese correo tiene una cuenta, te enviamos instrucciones para restablecer tu contraseña\./);
  assert.match(authSource, /Revisa tu correo para continuar\. Si ya tenías una cuenta con ese correo, inicia sesión\./);
  assert.match(authSource, /No pudimos completar el registro en este momento\. Inténtalo de nuevo en unos minutos\./);
  assert.match(authSource, /No pudimos procesar la solicitud en este momento\. Inténtalo de nuevo en unos minutos\./);
});

test('password policy remains ten characters plus uppercase lowercase number and special', () => {
  assert.match(validationSource, /password\.length\s*>=\s*10/);
  assert.match(validationSource, /\/\[A-Z\]\//);
  assert.match(validationSource, /\/\[a-z\]\//);
  assert.match(validationSource, /\/\[0-9\]\//);
  assert.match(validationSource, /\/\[\^A-Za-z0-9\]\//);
  for (const label of ['Mínimo 10 caracteres', 'Una letra mayúscula', 'Una letra minúscula', 'Un número', 'Un carácter especial']) {
    assert.match(validationSource, new RegExp(label));
  }
});

test('password checklists communicate fulfilled and pending requirements with text', () => {
  for (const source of [authSource, changeSource, resetSource]) {
    assert.match(source, /Cumplido:/);
    assert.match(source, /Pendiente:/);
    assert.match(source, /REQUIREMENT_LABELS\.map/);
  }
});

test('password confirmation retains both matching messages', () => {
  for (const source of [authSource, changeSource, resetSource]) {
    assert.match(source, /Las contraseñas coinciden/);
    assert.match(source, /Las contraseñas no coinciden/);
  }
});

test('authenticated password change preserves current_password', () => {
  assert.match(changeSource, /current_password:\s*currentPassword/);
  assert.match(changeSource, /password:\s*newPassword/);
});

test('authenticated password change preserves reauthenticate and nonce', () => {
  assert.match(changeSource, /supabase\.auth\.reauthenticate\(\)/);
  assert.match(changeSource, /attributes\.nonce\s*=\s*nonce/);
  assert.match(changeSource, /needsReauth/);
  assert.match(changeSource, /reauthSent/);
});

test('reauthentication code remains a six-digit one-time code field', () => {
  assert.match(changeSource, /autoComplete="one-time-code"/);
  assert.match(changeSource, /inputMode="numeric"/);
  assert.match(changeSource, /pattern="\[0-9\]\*"/);
  assert.match(changeSource, /maxLength=\{6\}/);
  assert.match(changeSource, /Enviamos un código de verificación a tu correo\./);
});

test('reset password preserves Supabase updateUser and completion flow', () => {
  assert.match(resetSource, /supabase\.auth\.updateUser\(\{\s*password\s*\}\)/);
  assert.match(resetSource, /setTimeout\(onComplete,\s*2000\)/);
});

test('password fields preserve current-password and new-password autocomplete contracts', () => {
  assert.match(authSource, /'current-password'\s*:\s*'new-password'/);
  assert.match(changeSource, /autoComplete="current-password"/);
  assert.match(changeSource, /autoComplete="new-password"/);
  assert.match(resetSource, /autoComplete="new-password"/);
});

test('password visibility controls have dynamic labels, hidden icons, and touch targets', () => {
  for (const source of [authSource, changeSource, resetSource]) {
    assert.match(source, /Mostrar contraseña/);
    assert.match(source, /Ocultar contraseña/);
    assert.match(source, /min-h-touch min-w-touch/);
    assert.match(source, /aria-hidden="true"/);
  }
});

test('auth dialogs reuse the accessible Design System Modal', () => {
  assert.match(authSource, /<Modal/);
  assert.match(changeSource, /<Modal/);
  assert.doesNotMatch(authSource, /role="dialog"/);
  assert.doesNotMatch(changeSource, /role="dialog"/);
});

test('auth screens remain fluid and do not add fictional social providers', () => {
  const combined = `${authSource}\n${changeSource}\n${resetSource}`;
  assert.doesNotMatch(combined, /(?:width|w-)\s*[:=]?\s*\[?390px/i);
  assert.doesNotMatch(combined, /Iniciar (?:sesión )?con (?:Google|Facebook|Apple|Microsoft)/i);
  assert.match(authSource, /sm:grid-cols-2/);
});

test('auth frontend contains no backend secrets or secret Stripe keys', () => {
  const combined = authSources.join('\n');
  assert.doesNotMatch(combined, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(combined, /STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|CREDENTIALS_ENCRYPTION_KEY/);
  assert.doesNotMatch(combined, /sk_live_|whsec_/);
});
