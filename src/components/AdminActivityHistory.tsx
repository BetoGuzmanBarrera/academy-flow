import { useCallback, useMemo, useState } from 'react';
import { Clock3, Loader2, RefreshCw, ScrollText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  emptyAdminActivityFilters,
  emptyOrderHistoryFilters,
  filterAdminActivityLogs,
  filterOrderStatusHistory,
  getSafeAdminMetadata,
} from '../lib/adminActivityHistory';
import type {
  AdminActivityFilters,
  AdminActivityLogEntry,
  OrderHistoryFilters,
  OrderStatusHistoryEntry,
} from '../lib/adminActivityHistory';
import type { Order } from '../lib/database.types';

const HISTORY_LIMIT = 100;
const ORDER_STATUSES: Order['status'][] = ['pending', 'in_progress', 'completed', 'cancelled'];

export function AdminActivityHistory() {
  const [activityLogs, setActivityLogs] = useState<AdminActivityLogEntry[]>([]);
  const [orderHistory, setOrderHistory] = useState<OrderStatusHistoryEntry[]>([]);
  const [activityFilters, setActivityFilters] = useState<AdminActivityFilters>(emptyAdminActivityFilters);
  const [orderFilters, setOrderFilters] = useState<OrderHistoryFilters>(emptyOrderHistoryFilters);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [activityError, setActivityError] = useState('');
  const [orderHistoryError, setOrderHistoryError] = useState('');

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setActivityError('');
    setOrderHistoryError('');

    const [activitySettled, orderHistorySettled] = await Promise.allSettled([
      supabase
        .from('admin_activity_log')
        .select('id, admin_id, action, target_table, target_id, details, created_at')
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT),
      supabase
        .from('order_status_history')
        .select('id, order_id, from_status, to_status, changed_by, created_at')
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT),
    ]);

    if (activitySettled.status === 'fulfilled' && !activitySettled.value.error) {
      setActivityLogs(activitySettled.value.data ?? []);
    } else {
      setActivityLogs([]);
      console.error(
        'No se pudo cargar la actividad administrativa:',
        activitySettled.status === 'fulfilled' ? activitySettled.value.error : activitySettled.reason,
      );
      setActivityError('No se pudo cargar la actividad administrativa. Verifica tu sesión AAL2 e inténtalo de nuevo.');
    }

    if (orderHistorySettled.status === 'fulfilled' && !orderHistorySettled.value.error) {
      setOrderHistory(orderHistorySettled.value.data ?? []);
    } else {
      setOrderHistory([]);
      console.error(
        'No se pudo cargar el historial de órdenes:',
        orderHistorySettled.status === 'fulfilled' ? orderHistorySettled.value.error : orderHistorySettled.reason,
      );
      setOrderHistoryError('No se pudo cargar el historial de órdenes. Verifica tu sesión AAL2 e inténtalo de nuevo.');
    }

    setLoaded(true);
    setLoading(false);
  }, []);

  const filteredActivity = useMemo(
    () => filterAdminActivityLogs(activityLogs, activityFilters),
    [activityLogs, activityFilters],
  );
  const filteredOrderHistory = useMemo(
    () => filterOrderStatusHistory(orderHistory, orderFilters),
    [orderHistory, orderFilters],
  );
  const activityActions = useMemo(
    () => [...new Set(activityLogs.map((entry) => entry.action))].sort(),
    [activityLogs],
  );
  const activityTargets = useMemo(
    () => [...new Set(activityLogs.map((entry) => entry.target_table))].sort(),
    [activityLogs],
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Actividad y trazabilidad</h2>
          <p className="text-sm text-gray-600">
            Consulta de solo lectura protegida por las policies de administrador y AAL2.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadHistory()}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
          {loading ? 'Cargando…' : 'Cargar / actualizar'}
        </button>
      </div>

      <p className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">
        Mostrando los 100 registros más recientes por sección.
      </p>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <ScrollText size={20} className="text-blue-600" />
          <h3 className="text-lg font-bold text-gray-900">Actividad administrativa</h3>
        </div>

        {activityError && <ErrorMessage message={activityError} />}

        <div className="rounded-xl border bg-white p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(180px,1fr)_minmax(180px,1fr)_auto]">
            <label className="space-y-1 text-sm font-medium text-gray-700">
              <span>Buscar actividad</span>
              <input
                type="search"
                value={activityFilters.search}
                onChange={(event) => setActivityFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Acción, recurso, ID o administrador"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-gray-700">
              <span>Acción</span>
              <select
                value={activityFilters.action}
                onChange={(event) => setActivityFilters((current) => ({ ...current, action: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
              >
                <option value="all">Todas</option>
                {activityActions.map((action) => <option key={action} value={action}>{action}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium text-gray-700">
              <span>Tipo de recurso</span>
              <select
                value={activityFilters.targetTable}
                onChange={(event) => setActivityFilters((current) => ({ ...current, targetTable: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
              >
                <option value="all">Todos</option>
                {activityTargets.map((target) => <option key={target} value={target}>{target}</option>)}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setActivityFilters(emptyAdminActivityFilters)}
              className="self-end rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Limpiar filtros
            </button>
          </div>
          <p className="mt-3 text-sm text-gray-500">
            {filteredActivity.length} de {activityLogs.length} registros
          </p>
        </div>

        {loading ? (
          <HistoryLoader />
        ) : !loaded ? (
          <EmptyState message="Usa “Cargar / actualizar” para consultar la actividad reciente." />
        ) : activityLogs.length === 0 ? (
          <EmptyState message="No hay actividad administrativa para mostrar." />
        ) : filteredActivity.length === 0 ? (
          <EmptyState message="No hay actividad que coincida con los filtros." />
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="p-4">Fecha</th>
                  <th className="p-4">Acción</th>
                  <th className="p-4">Recurso</th>
                  <th className="p-4">Administrador</th>
                  <th className="p-4">Resumen seguro</th>
                </tr>
              </thead>
              <tbody>
                {filteredActivity.map((entry) => {
                  const safeMetadata = getSafeAdminMetadata(entry.details);
                  return (
                    <tr key={entry.id} className="border-t align-top">
                      <td className="p-4 text-xs text-gray-600">{formatDate(entry.created_at)}</td>
                      <td className="p-4"><CodeBadge value={entry.action} /></td>
                      <td className="p-4">
                        <p className="font-medium text-gray-900">{entry.target_table}</p>
                        <p className="mt-1 font-mono text-xs text-gray-500">{shortId(entry.target_id)}</p>
                      </td>
                      <td className="p-4 font-mono text-xs text-gray-600">{shortId(entry.admin_id)}</td>
                      <td className="p-4">
                        {safeMetadata.length === 0 ? (
                          <span className="text-gray-400">Sin metadata segura</span>
                        ) : (
                          <dl className="space-y-1 text-xs text-gray-700">
                            {safeMetadata.map((item) => (
                              <div key={item.label}>
                                <dt className="inline font-semibold">{item.label}: </dt>
                                <dd className="inline break-words">{item.value}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-4 border-t pt-8">
        <div className="flex items-center gap-2">
          <Clock3 size={20} className="text-blue-600" />
          <h3 className="text-lg font-bold text-gray-900">Historial de órdenes</h3>
        </div>

        {orderHistoryError && <ErrorMessage message={orderHistoryError} />}

        <div className="rounded-xl border bg-white p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(180px,1fr)_minmax(180px,1fr)_auto]">
            <label className="space-y-1 text-sm font-medium text-gray-700">
              <span>Buscar historial</span>
              <input
                type="search"
                value={orderFilters.search}
                onChange={(event) => setOrderFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Orden o responsable"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-gray-700">
              <span>Estado anterior</span>
              <select
                value={orderFilters.fromStatus}
                onChange={(event) => setOrderFilters((current) => ({ ...current, fromStatus: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
              >
                <option value="all">Todos</option>
                {ORDER_STATUSES.map((status) => <option key={status} value={status}>{getStatusLabel(status)}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium text-gray-700">
              <span>Estado nuevo</span>
              <select
                value={orderFilters.toStatus}
                onChange={(event) => setOrderFilters((current) => ({ ...current, toStatus: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
              >
                <option value="all">Todos</option>
                {ORDER_STATUSES.map((status) => <option key={status} value={status}>{getStatusLabel(status)}</option>)}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setOrderFilters(emptyOrderHistoryFilters)}
              className="self-end rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Limpiar filtros
            </button>
          </div>
          <p className="mt-3 text-sm text-gray-500">
            {filteredOrderHistory.length} de {orderHistory.length} registros
          </p>
        </div>

        {loading ? (
          <HistoryLoader />
        ) : !loaded ? (
          <EmptyState message="Usa “Cargar / actualizar” para consultar el historial reciente." />
        ) : orderHistory.length === 0 ? (
          <EmptyState message="No hay transiciones de órdenes para mostrar." />
        ) : filteredOrderHistory.length === 0 ? (
          <EmptyState message="No hay transiciones que coincidan con los filtros." />
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="p-4">Fecha</th>
                  <th className="p-4">Orden</th>
                  <th className="p-4">Transición</th>
                  <th className="p-4">Responsable</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrderHistory.map((entry) => (
                  <tr key={entry.id} className="border-t align-top">
                    <td className="p-4 text-xs text-gray-600">{formatDate(entry.created_at)}</td>
                    <td className="p-4 font-mono text-xs">{shortId(entry.order_id)}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <OrderHistoryStatusBadge status={entry.from_status} />
                        <span aria-hidden="true" className="text-gray-400">→</span>
                        <OrderHistoryStatusBadge status={entry.to_status} />
                      </div>
                    </td>
                    <td className="p-4 font-mono text-xs text-gray-600">{shortId(entry.changed_by)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha inválida' : date.toLocaleString('es-MX');
}

function shortId(value: string | null): string {
  if (!value) return 'Sistema';
  return value.length > 8 ? `${value.slice(0, 8)}…` : value;
}

function isOrderStatus(status: string): status is Order['status'] {
  return ORDER_STATUSES.includes(status as Order['status']);
}

function getStatusLabel(status: Order['status']): string {
  const labels: Record<Order['status'], string> = {
    pending: 'Pendiente',
    in_progress: 'En proceso',
    completed: 'Completada',
    cancelled: 'Cancelada',
  };
  return labels[status];
}

function OrderHistoryStatusBadge({ status }: { status: string }) {
  const classes: Record<Order['status'], string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    in_progress: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  if (!isOrderStatus(status)) return <CodeBadge value={status} />;

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${classes[status]}`}>
      {getStatusLabel(status)}
    </span>
  );
}

function CodeBadge({ value }: { value: string }) {
  return <span className="rounded-full bg-gray-100 px-2 py-1 font-mono text-xs text-gray-800">{value}</span>;
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-xl border bg-white p-10 text-center text-gray-500">{message}</div>;
}

function ErrorMessage({ message }: { message: string }) {
  return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">{message}</div>;
}

function HistoryLoader() {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-xl border bg-white">
      <Loader2 size={32} className="animate-spin text-blue-600" />
    </div>
  );
}
