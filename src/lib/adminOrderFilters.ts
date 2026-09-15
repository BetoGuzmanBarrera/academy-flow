import type { Order } from './database.types';

export type AdminOrderStatusFilter = 'all' | Order['status'];
export type AdminPaymentStatusFilter = 'all' | Order['payment_status'];

export type AdminOrderFilters = {
  search: string;
  status: AdminOrderStatusFilter;
  paymentStatus: AdminPaymentStatusFilter;
};

type FilterableAdminOrder = Pick<Order, 'id' | 'status' | 'payment_status'> & {
  items: Array<{
    service: { name: string } | null;
  }> | null;
};

export const emptyAdminOrderFilters: AdminOrderFilters = {
  search: '',
  status: 'all',
  paymentStatus: 'all',
};

export function filterAdminOrders<T extends FilterableAdminOrder>(
  orders: readonly T[],
  filters: AdminOrderFilters,
): T[] {
  const search = filters.search.trim().toLowerCase();

  return orders.filter((order) => {
    if (filters.status !== 'all' && order.status !== filters.status) return false;
    if (filters.paymentStatus !== 'all' && order.payment_status !== filters.paymentStatus) {
      return false;
    }

    if (!search) return true;

    return (
      order.id.toLowerCase().includes(search)
      || order.items?.some((item) => item.service?.name.toLowerCase().includes(search)) === true
    );
  });
}

export function hasActiveAdminOrderFilters(filters: AdminOrderFilters): boolean {
  return (
    filters.search.trim().length > 0
    || filters.status !== 'all'
    || filters.paymentStatus !== 'all'
  );
}
