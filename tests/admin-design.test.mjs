import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const adminSource = readSource('src/pages/Admin.tsx');
const mfaGateSource = readSource('src/components/AdminMfaGate.tsx');
const activitySource = readSource('src/components/AdminActivityHistory.tsx');
const referralSource = readSource('src/components/AdminReferralMetrics.tsx');
const modalSource = readSource('src/components/ui/Modal.tsx');
const adminShellSource = readSource('src/components/admin/AdminShell.tsx');
const appSource = readSource('src/App.tsx');

test('Admin remains protected by the MFA and AAL2 gate', () => {
  assert.match(adminSource, /<AdminMfaGate[\s\S]*?<AdminDashboard\s+onNavigate=\{onNavigate\}\s*\/>[\s\S]*?<\/AdminMfaGate>/);
  assert.match(mfaGateSource, /getAdminMfaGateDecision\(isAdmin,\s*status\)/);
  assert.match(mfaGateSource, /getAdminMfaStatus\(supabase\.auth\.mfa\)/);
  assert.match(mfaGateSource, /currentLevel\s*!==\s*['"]aal2['"]/);
  assert.doesNotMatch(mfaGateSource, /if\s*\(isAdmin\)\s*return\s+children/);
});

test('TOTP enrollment and verification keep the official Supabase flow', () => {
  assert.match(mfaGateSource, /supabase\.auth\.mfa\.enroll\(\{[\s\S]*?factorType:\s*['"]totp['"][\s\S]*?issuer:\s*['"]Academy Flow['"]/);
  assert.match(mfaGateSource, /supabase\.auth\.mfa\.challenge\(\{\s*factorId\s*\}\)/);
  assert.match(mfaGateSource, /supabase\.auth\.mfa\.verify\(\{[\s\S]*?factorId,[\s\S]*?challengeId:[\s\S]*?code:\s*normalizedCode/);
  assert.match(mfaGateSource, /supabase\.auth\.refreshSession\(\)/);
  assert.match(mfaGateSource, /\/\^\\d\{6\}\$\//);
  assert.match(mfaGateSource, /inputMode="numeric"/);
  assert.match(mfaGateSource, /autoComplete="one-time-code"/);
  assert.match(mfaGateSource, /maxLength=\{6\}/);
  assert.doesNotMatch(mfaGateSource, /localStorage|sessionStorage/);
});

test('Admin shell preserves all seven accessible sections', () => {
  const expectedTabs = [
    ['dashboard', 'Resumen'],
    ['services', 'Servicios'],
    ['orders', 'Órdenes'],
    ['support', 'Soporte'],
    ['credentials', 'Credenciales'],
    ['activity', 'Actividad'],
    ['referrals', 'Referidos'],
  ];

  for (const [id, label] of expectedTabs) {
    assert.match(adminShellSource, new RegExp(`id:\\s*['"]${id}['"],\\s*label:\\s*['"]${label}['"]`));
  }
  assert.match(adminSource, /<AdminShell/);
  assert.match(adminShellSource, /<nav aria-label="Navegación administrativa"/);
  assert.match(adminShellSource, /aria-current=\{active \? ['"]page['"] : undefined\}/);
  assert.doesNotMatch(adminSource, /role="tabpanel"/);
});

test('Admin uses the approved desktop sidebar and accessible mobile Drawer', () => {
  assert.match(adminShellSource, /w-\[248px\]/);
  assert.match(adminShellSource, /h-\[72px\]/);
  assert.match(adminShellSource, /h-\[68px\]/);
  assert.match(adminShellSource, /<Drawer[\s\S]*?side="left"/);
  assert.match(adminShellSource, /aria-label="Abrir navegación administrativa"/);
  assert.match(adminShellSource, /Volver al sitio/);
  assert.match(adminShellSource, /Mi cuenta/);
});

test('Public site chrome does not surround the dedicated Admin shell', () => {
  assert.match(appSource, /currentPage !== ['"]admin['"] && \([\s\S]*?<Header/);
  assert.match(appSource, /currentPage !== ['"]admin['"] && \([\s\S]*?<Footer/);
  assert.match(appSource, /currentPage !== ['"]admin['"] && <SupportChat/);
  assert.match(appSource, /<Admin onNavigate=\{handleNavigate\}/);
});

test('Dashboard metrics and recent orders remain grounded in real data', () => {
  assert.match(adminSource, /const paidOrders = orders\.filter\(\(order\) => order\.payment_status === ['"]paid['"]\)/);
  assert.match(adminSource, /revenue:\s*paidOrders\.reduce/);
  assert.match(adminSource, /orders\.slice\(0,\s*5\)/);
  assert.doesNotMatch(adminSource, /99\.99%|usuarios online|ventas proyectadas|conversión/i);
});

test('Admin data loading preserves the established Supabase queries', () => {
  assert.match(adminSource, /supabase\.from\(['"]categories['"]\)\.select\(['"]\*['"]\)\.order\(['"]name['"]\)/);
  assert.match(adminSource, /supabase\.from\(['"]services['"]\)\.select\(['"]\*['"]\)\.order\(['"]created_at['"],\s*\{\s*ascending:\s*false\s*\}\)/);
  assert.match(adminSource, /supabase\.from\(['"]support_messages['"]\)\.select\(['"]\*['"]\)\.order\(['"]created_at['"],\s*\{\s*ascending:\s*false\s*\}\)/);
  assert.match(adminSource, /items:order_items\([\s\S]*?service:services\(\*,\s*category:categories\(\*\)\)/);
});

test('Catalog validation, locking, persistence, and audit contracts remain intact', () => {
  assert.match(adminSource, /validateAdminServiceDraft\(newService\)/);
  assert.match(adminSource, /validateAdminServiceDraft\(editingService\.draft\)/);
  assert.match(adminSource, /runCatalogMutationOnce\(catalogMutationLock/);
  assert.match(adminSource, /const catalogMutationLock = useRef\(false\)/);
  assert.match(adminSource, /serviceToAdminDraft\(service\)/);
  assert.match(adminSource, /replaceAdminService\(current,\s*data\)/);
  assert.match(adminSource, /getAdminServiceStatusLabel\(service\.is_active\)/);
  assert.match(adminSource, /\.from\(['"]admin_activity_log['"]\)\.insert/);
  assert.match(adminSource, /logAction\(['"]create['"],\s*['"]categories['"]/);
  assert.doesNotMatch(adminSource, /\.from\(['"]services['"]\)\s*\.delete\(/);
});

test('Order status changes keep the secure endpoint, auth payload, and unpaid-order guard', () => {
  assert.match(adminSource, /performOrderStatusChange/);
  assert.match(adminSource, /\/functions\/v1\/complete-order/);
  assert.match(adminSource, /supabase\.auth\.getSession\(\)/);
  assert.match(adminSource, /['"]Authorization['"]:\s*`Bearer \$\{accessToken\}`/);
  assert.match(adminSource, /JSON\.stringify\(\{\s*orderId:\s*order\.id,\s*status\s*\}\)/);
  assert.match(adminSource, /getOrderProcessingBlockReason/);
  assert.match(adminSource, /\.from\(['"]orders['"]\)[\s\S]*?\.select\(['"]status, payment_status['"]\)[\s\S]*?\.eq\(['"]id['"],\s*order\.id\)[\s\S]*?\.single\(\)/);
});

test('Irreversible cancellation keeps explicit confirmation and duplicate locking', () => {
  assert.match(adminSource, /requiresOrderCancellationConfirmation\(status\)/);
  assert.match(adminSource, /runOrderCancellationOnce\(cancellationLock/);
  assert.match(adminSource, /const cancellationLock = useRef\(false\)/);
  assert.match(adminSource, /Cancelar esta orden eliminará de forma irreversible las credenciales asociadas/);
  assert.match(adminSource, /Esta acción no se puede deshacer/);
  assert.match(adminSource, /Cancelar orden/);
  assert.match(adminSource, /<Modal[\s\S]*?Cancelar orden/);
  assert.match(modalSource, /role="dialog"/);
  assert.match(modalSource, /useDialogBehavior\(open,\s*onClose,\s*dismissible\)/);
});

test('Credential listing and reveal retain explicit authenticated server-side flows', () => {
  assert.match(adminSource, /\/functions\/v1\/list-order-credentials/);
  assert.match(adminSource, /\/functions\/v1\/reveal-order-credentials/);
  assert.match(adminSource, /JSON\.stringify\(\{\s*credentialId:\s*credential\.credentialId\s*\}\)/);
  assert.doesNotMatch(adminSource, /JSON\.stringify\(\{\s*orderId:\s*credential/);
  assert.match(adminSource, /runCredentialRevealOnce\(revealLock/);
  assert.match(adminSource, /const revealLock = useRef\(false\)/);
  assert.match(adminSource, /canRevealCredential\(credential\)/);
  assert.match(adminSource, /setPendingRevealCredential\(credential\)/);
  assert.match(adminSource, /Confirmar revelado de credencial/);
  assert.match(adminSource, /window\.setTimeout\(\(\) => \{[\s\S]*?setRevealedCredential\(null\)[\s\S]*?\},\s*30000\)/);
  assert.match(adminSource, /tab !== ['"]credentials['"][\s\S]*?setRevealedCredential\(null\)[\s\S]*?setPendingRevealCredential\(null\)/);
  assert.doesNotMatch(adminSource, /localStorage|sessionStorage/);
  assert.doesNotMatch(adminSource, /encrypted_payload|encryption_iv/);
});

test('Credential audit remains bounded and does not query secret material', () => {
  assert.match(adminSource, /\.from\(['"]credential_access_log['"]\)/);
  assert.match(adminSource, /\.select\(['"]id, credential_id, order_id, requested_credential_id, action, success, reason_code, request_id, created_at['"]\)/);
  assert.match(adminSource, /\.limit\(100\)/);
});

test('Support operations preserve real statuses, response fields, and audit actions', () => {
  for (const status of ['pending', 'in_progress', 'resolved']) {
    assert.match(adminSource, new RegExp(`<option value=['"]${status}['"]`));
  }
  assert.match(adminSource, /admin_response:\s*response/);
  assert.match(adminSource, /status:\s*['"]resolved['"]/);
  assert.match(adminSource, /updated_at:\s*new Date\(\)\.toISOString\(\)/);
  assert.match(adminSource, /logAction\(['"]respond['"],\s*['"]support_messages['"]/);
  assert.match(adminSource, /logAction\(['"]update_status['"],\s*['"]support_messages['"]/);
});

test('Activity and referral modules remain bounded, safe, and read-only', () => {
  assert.match(activitySource, /const HISTORY_LIMIT = 100/);
  assert.match(activitySource, /getSafeAdminMetadata\(entry\.details\)/);
  assert.match(activitySource, /\.from\(['"]admin_activity_log['"]\)/);
  assert.match(activitySource, /\.from\(['"]order_status_history['"]\)/);
  assert.match(referralSource, /const DATA_LIMIT = 100/);
  assert.match(referralSource, /\.from\(['"]referral_codes['"]\)/);
  assert.match(referralSource, /\.from\(['"]referral_uses['"]\)/);
  assert.doesNotMatch(referralSource, /\.insert\(|\.update\(|\.delete\(/);
});

test('Admin 2.0 introduces no fixed mobile canvas or hardcoded secret material', () => {
  const combinedSource = [adminSource, mfaGateSource, activitySource, referralSource].join('\n');
  assert.doesNotMatch(combinedSource, /(?:width|w-)\s*[:=]?\s*\[?390px/i);
  assert.doesNotMatch(combinedSource, /SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|sk_live_|whsec_/i);
});
