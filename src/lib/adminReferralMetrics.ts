import type { ReferralCode, ReferralUse } from './database.types';

export type AdminReferralUsageFilter = 'all' | 'with_uses' | 'without_uses';

export type AdminReferralFilters = {
  search: string;
  usage: AdminReferralUsageFilter;
};

export type AdminReferralMetrics = {
  codesTotal: number;
  codesUsed: number;
  codesUnused: number;
  usesTotal: number;
  recentCustomers: number;
  recentDiscount: number;
};

export const emptyAdminReferralFilters: AdminReferralFilters = {
  search: '',
  usage: 'all',
};

export function filterAdminReferralCodes<T extends ReferralCode>(
  codes: readonly T[],
  recentUses: readonly ReferralUse[],
  filters: AdminReferralFilters,
): T[] {
  const search = filters.search.trim().toLocaleLowerCase('es-MX');
  const orderIdsByCode = new Map<string, string[]>();

  for (const use of recentUses) {
    const orderIds = orderIdsByCode.get(use.referral_code_id) ?? [];
    orderIds.push(use.order_id);
    orderIdsByCode.set(use.referral_code_id, orderIds);
  }

  return codes.filter((code) => {
    const usesCount = code.uses_count ?? 0;
    const matchesUsage = filters.usage === 'all'
      || (filters.usage === 'with_uses' ? usesCount > 0 : usesCount === 0);
    const matchesSearch = !search || [
      code.code,
      code.user_id,
      ...(orderIdsByCode.get(code.id) ?? []),
    ].some((value) => value.toLocaleLowerCase('es-MX').includes(search));

    return matchesUsage && matchesSearch;
  });
}

export function calculateAdminReferralMetrics(
  counts: Pick<AdminReferralMetrics, 'codesTotal' | 'codesUsed' | 'usesTotal'>,
  recentUses: readonly ReferralUse[],
): AdminReferralMetrics {
  return {
    ...counts,
    codesUnused: Math.max(counts.codesTotal - counts.codesUsed, 0),
    recentCustomers: new Set(recentUses.map((use) => use.used_by_user_id)).size,
    recentDiscount: recentUses.reduce((total, use) => total + Number(use.discount_amount), 0),
  };
}

export function getRecentUsesForCode(
  codeId: string,
  recentUses: readonly ReferralUse[],
): ReferralUse[] {
  return recentUses.filter((use) => use.referral_code_id === codeId);
}
