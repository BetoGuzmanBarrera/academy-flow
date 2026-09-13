export type AdminMfaLevel = string | null;

export interface VerifiedTotpFactor {
  id: string;
  factor_type: 'totp';
  status: 'verified';
}

export interface AdminMfaStatus {
  currentLevel: AdminMfaLevel;
  nextLevel: AdminMfaLevel;
  verifiedTotpFactor: VerifiedTotpFactor | null;
}

export type AdminMfaGateDecision = 'denied' | 'enroll' | 'challenge' | 'allowed';

interface AdminMfaApi {
  listFactors: () => Promise<{
    data: { totp: VerifiedTotpFactor[] } | null;
    error: unknown;
  }>;
  getAuthenticatorAssuranceLevel: () => Promise<{
    data: {
      currentLevel: AdminMfaLevel;
      nextLevel: AdminMfaLevel;
    } | null;
    error: unknown;
  }>;
}

export async function getAdminMfaStatus(mfa: AdminMfaApi): Promise<AdminMfaStatus> {
  const [factorsResult, assuranceResult] = await Promise.all([
    mfa.listFactors(),
    mfa.getAuthenticatorAssuranceLevel(),
  ]);

  if (factorsResult.error || assuranceResult.error || !factorsResult.data || !assuranceResult.data) {
    throw new Error('Unable to determine MFA status');
  }

  return {
    currentLevel: assuranceResult.data.currentLevel,
    nextLevel: assuranceResult.data.nextLevel,
    verifiedTotpFactor: factorsResult.data.totp[0] ?? null,
  };
}

export function getAdminMfaGateDecision(
  isAdmin: boolean,
  status: AdminMfaStatus,
): AdminMfaGateDecision {
  if (!isAdmin) return 'denied';
  if (!status.verifiedTotpFactor) return 'enroll';
  if (status.currentLevel === 'aal2') return 'allowed';
  return 'challenge';
}
