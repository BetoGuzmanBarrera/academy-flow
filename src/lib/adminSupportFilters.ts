import type { SupportMessage } from './database.types';

export type AdminSupportStatusFilter = 'all' | SupportMessage['status'];

export type AdminSupportFilters = {
  search: string;
  status: AdminSupportStatusFilter;
};

type FilterableSupportMessage = Pick<
  SupportMessage,
  'message' | 'status' | 'user_email' | 'user_id' | 'user_name'
>;

export const emptyAdminSupportFilters: AdminSupportFilters = {
  search: '',
  status: 'all',
};

export function buildAdminSupportStatusUpdate(
  status: SupportMessage['status'],
  updatedAt = new Date(),
): Pick<SupportMessage, 'status' | 'updated_at'> {
  return {
    status,
    updated_at: updatedAt.toISOString(),
  };
}

export function filterAdminSupportMessages<T extends FilterableSupportMessage>(
  messages: readonly T[],
  filters: AdminSupportFilters,
): T[] {
  const search = filters.search.trim().toLowerCase();

  return messages.filter((message) => {
    if (filters.status !== 'all' && message.status !== filters.status) return false;
    if (!search) return true;

    return [
      message.message,
      message.user_id ?? '',
      message.user_email,
      message.user_name,
    ].some((value) => value.toLowerCase().includes(search));
  });
}

export function hasActiveAdminSupportFilters(filters: AdminSupportFilters): boolean {
  return filters.search.trim().length > 0 || filters.status !== 'all';
}
