import type { Database, Json } from './database.types';

export type AdminActivityLogEntry = Database['public']['Tables']['admin_activity_log']['Row'];
export type OrderStatusHistoryEntry = Database['public']['Tables']['order_status_history']['Row'];

export type AdminActivityFilters = {
  search: string;
  action: string;
  targetTable: string;
};

export type OrderHistoryFilters = {
  search: string;
  fromStatus: string;
  toStatus: string;
};

export type SafeAdminMetadataItem = {
  label: string;
  value: string;
};

export const emptyAdminActivityFilters: AdminActivityFilters = {
  search: '',
  action: 'all',
  targetTable: 'all',
};

export const emptyOrderHistoryFilters: OrderHistoryFilters = {
  search: '',
  fromStatus: 'all',
  toStatus: 'all',
};

const SAFE_METADATA_FIELDS: Record<string, string> = {
  category_id: 'Categoría',
  from: 'Estado anterior',
  is_active: 'Disponibilidad',
  name: 'Nombre',
  new_status: 'Estado nuevo',
  previous_status: 'Estado anterior',
  price: 'Precio',
  status: 'Estado',
  to: 'Estado nuevo',
};

export function filterAdminActivityLogs<T extends AdminActivityLogEntry>(
  entries: readonly T[],
  filters: AdminActivityFilters,
): T[] {
  const search = filters.search.trim().toLocaleLowerCase('es-MX');

  return entries.filter((entry) => {
    const matchesSearch = !search || [
      entry.action,
      entry.target_table,
      entry.target_id ?? '',
      entry.admin_id,
    ].some((value) => value.toLocaleLowerCase('es-MX').includes(search));
    const matchesAction = filters.action === 'all' || entry.action === filters.action;
    const matchesTargetTable = filters.targetTable === 'all'
      || entry.target_table === filters.targetTable;

    return matchesSearch && matchesAction && matchesTargetTable;
  });
}

export function filterOrderStatusHistory<T extends OrderStatusHistoryEntry>(
  entries: readonly T[],
  filters: OrderHistoryFilters,
): T[] {
  const search = filters.search.trim().toLocaleLowerCase('es-MX');

  return entries.filter((entry) => {
    const matchesSearch = !search || [
      entry.order_id,
      entry.changed_by ?? '',
    ].some((value) => value.toLocaleLowerCase('es-MX').includes(search));
    const matchesFromStatus = filters.fromStatus === 'all'
      || entry.from_status === filters.fromStatus;
    const matchesToStatus = filters.toStatus === 'all'
      || entry.to_status === filters.toStatus;

    return matchesSearch && matchesFromStatus && matchesToStatus;
  });
}

export function getSafeAdminMetadata(details: Json): SafeAdminMetadataItem[] {
  if (!details || Array.isArray(details) || typeof details !== 'object') return [];

  return Object.entries(details).flatMap(([key, value]) => {
    const label = SAFE_METADATA_FIELDS[key];
    if (!label || !['string', 'number', 'boolean'].includes(typeof value)) return [];

    const displayValue = typeof value === 'boolean'
      ? (value ? 'Activo' : 'Inactivo')
      : String(value).slice(0, 120);

    return [{ label, value: displayValue }];
  });
}
