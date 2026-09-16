export type CredentialLifecycleState =
  | 'available'
  | 'expiring_soon'
  | 'expired'
  | 'deleted'
  | 'unavailable';

export type CredentialOrderStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export type AdminCredentialMetadata = {
  credentialId: string;
  orderId: string;
  serviceId: string;
  serviceName: string;
  orderStatus: CredentialOrderStatus | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  deletedAt: string | null;
  hasEncryptedPayload: boolean;
};

export type CredentialAccessLogEntry = {
  id: string;
  credential_id: string | null;
  order_id: string | null;
  requested_credential_id: string | null;
  action: string;
  success: boolean;
  reason_code: string | null;
  request_id: string | null;
  created_at: string;
};

export type AdminCredentialFilters = {
  search: string;
  state: 'all' | CredentialLifecycleState;
};

export type AdminCredentialAuditFilters = {
  search: string;
  action: string;
  outcome: 'all' | 'success' | 'failure';
};

export const emptyAdminCredentialFilters: AdminCredentialFilters = {
  search: '',
  state: 'all',
};

export const emptyAdminCredentialAuditFilters: AdminCredentialAuditFilters = {
  search: '',
  action: 'all',
  outcome: 'all',
};

const EXPIRING_SOON_MS = 24 * 60 * 60 * 1000;

export function getCredentialLifecycleState(
  credential: AdminCredentialMetadata,
  now = Date.now(),
): CredentialLifecycleState {
  if (credential.deletedAt) return 'deleted';

  if (credential.expiresAt) {
    const expiresAt = Date.parse(credential.expiresAt);
    if (!Number.isFinite(expiresAt)) return 'unavailable';
    if (expiresAt <= now) return 'expired';
    if (!credential.hasEncryptedPayload) return 'unavailable';
    if (expiresAt - now <= EXPIRING_SOON_MS) return 'expiring_soon';
  }

  return credential.hasEncryptedPayload ? 'available' : 'unavailable';
}

export function canRevealCredential(
  credential: AdminCredentialMetadata,
  now = Date.now(),
): boolean {
  const state = getCredentialLifecycleState(credential, now);
  return state === 'available' || state === 'expiring_soon';
}

export function filterAdminCredentials(
  credentials: readonly AdminCredentialMetadata[],
  filters: AdminCredentialFilters,
  now = Date.now(),
): AdminCredentialMetadata[] {
  const search = filters.search.trim().toLocaleLowerCase('es-MX');

  return credentials.filter((credential) => {
    const matchesSearch = !search || [
      credential.credentialId,
      credential.orderId,
      credential.serviceId,
      credential.serviceName,
      credential.orderStatus ?? '',
    ].some((value) => value.toLocaleLowerCase('es-MX').includes(search));

    const matchesState = filters.state === 'all'
      || getCredentialLifecycleState(credential, now) === filters.state;

    return matchesSearch && matchesState;
  });
}

export function filterCredentialAccessLogs(
  logs: readonly CredentialAccessLogEntry[],
  filters: AdminCredentialAuditFilters,
): CredentialAccessLogEntry[] {
  const search = filters.search.trim().toLocaleLowerCase('es-MX');

  return logs.filter((entry) => {
    const matchesSearch = !search || [
      entry.order_id ?? '',
      entry.credential_id ?? '',
      entry.requested_credential_id ?? '',
      entry.request_id ?? '',
      entry.reason_code ?? '',
    ].some((value) => value.toLocaleLowerCase('es-MX').includes(search));

    const matchesAction = filters.action === 'all' || entry.action === filters.action;
    const matchesOutcome = filters.outcome === 'all'
      || (filters.outcome === 'success' ? entry.success : !entry.success);

    return matchesSearch && matchesAction && matchesOutcome;
  });
}

export async function runCredentialRevealOnce<T>(
  lock: { current: boolean },
  reveal: () => Promise<T>,
): Promise<T | null> {
  if (lock.current) return null;

  lock.current = true;
  try {
    return await reveal();
  } finally {
    lock.current = false;
  }
}
