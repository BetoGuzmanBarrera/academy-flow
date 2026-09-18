import { useCallback, useMemo, useState } from 'react';
import { Clock3, History, Loader2, RefreshCw, ScrollText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState as UiEmptyState,
  SearchBar,
  Select,
} from './ui';
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

    try {
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
    } catch (error) {
      setActivityLogs([]);
      setOrderHistory([]);
      console.error('No se pudo cargar el historial administrativo:', error);
      setActivityError('No se pudo cargar la actividad administrativa. Verifica tu sesión AAL2 e inténtalo de nuevo.');
      setOrderHistoryError('No se pudo cargar el historial de órdenes. Verifica tu sesión AAL2 e inténtalo de nuevo.');
    } finally {
      setLoaded(true);
      setLoading(false);
    }
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Badge variant="primary">Solo lectura</Badge>
          <h2 className="mt-3 text-af-h2 text-academy-text">Actividad y trazabilidad</h2>
          <p className="mt-1 text-af-body-sm text-academy-text-muted">
            Consulta de solo lectura protegida por las policies de administrador y AAL2.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => void loadHistory()}
          loading={loading}
          leadingIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
        >
          {loading ? 'Cargando…' : 'Cargar / actualizar'}
        </Button>
      </div>

      <Alert variant="info">
        Mostrando los 100 registros más recientes por sección.
      </Alert>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <ScrollText size={20} className="text-blue-600" />
          <h3 className="text-lg font-bold text-gray-900">Actividad administrativa</h3>
        </div>

        {activityError && <Alert variant="error" role="alert">{activityError}</Alert>}

        <Card>
          <CardContent>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(180px,1fr)_minmax(180px,1fr)_auto]">
            <div>
              <label htmlFor="admin-activity-search" className="mb-1.5 block text-af-label text-academy-text">Buscar actividad</label>
              <SearchBar
                id="admin-activity-search"
                value={activityFilters.search}
                onChange={(event) => setActivityFilters((current) => ({ ...current, search: event.target.value }))}
                onClear={() => setActivityFilters((current) => ({ ...current, search: '' }))}
                placeholder="Acción, recurso, ID o administrador"
              />
            </div>
            <Select
              label="Acción"
                value={activityFilters.action}
                onChange={(event) => setActivityFilters((current) => ({ ...current, action: event.target.value }))}
              >
                <option value="all">Todas</option>
                {activityActions.map((action) => <option key={action} value={action}>{action}</option>)}
            </Select>
            <Select
              label="Tipo de recurso"
                value={activityFilters.targetTable}
                onChange={(event) => setActivityFilters((current) => ({ ...current, targetTable: event.target.value }))}
              >
                <option value="all">Todos</option>
                {activityTargets.map((target) => <option key={target} value={target}>{target}</option>)}
            </Select>
            <Button
              variant="secondary"
              onClick={() => setActivityFilters(emptyAdminActivityFilters)}
              className="self-end"
            >
              Limpiar filtros
            </Button>
          </div>
          <p className="mt-3 text-af-body-sm text-academy-text-muted" aria-live="polite">
            {filteredActivity.length} de {activityLogs.length} registros
          </p>
          </CardContent>
        </Card>

        {loading ? (
          <HistoryLoader />
        ) : !loaded ? (
          <UiEmptyState icon={<History className="h-8 w-8" />} title="Actividad pendiente de cargar" description="Usa “Cargar / actualizar” para consultar la actividad reciente." />
        ) : activityLogs.length === 0 ? (
          <UiEmptyState icon={<History className="h-8 w-8" />} title="Sin actividad administrativa" description="No hay actividad administrativa para mostrar." />
        ) : filteredActivity.length === 0 ? (
          <UiEmptyState icon={<History className="h-8 w-8" />} title="Sin coincidencias" description="No hay actividad que coincida con los filtros." />
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

        {orderHistoryError && <Alert variant="error" role="alert">{orderHistoryError}</Alert>}

        <Card>
          <CardContent>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(180px,1fr)_minmax(180px,1fr)_auto]">
            <div>
              <label htmlFor="admin-order-history-search" className="mb-1.5 block text-af-label text-academy-text">Buscar historial</label>
              <SearchBar
                id="admin-order-history-search"
                value={orderFilters.search}
                onChange={(event) => setOrderFilters((current) => ({ ...current, search: event.target.value }))}
                onClear={() => setOrderFilters((current) => ({ ...current, search: '' }))}
                placeholder="Orden o responsable"
              />
            </div>
            <Select
              label="Estado anterior"
                value={orderFilters.fromStatus}
                onChange={(event) => setOrderFilters((current) => ({ ...current, fromStatus: event.target.value }))}
              >
                <option value="all">Todos</option>
                {ORDER_STATUSES.map((status) => <option key={status} value={status}>{getStatusLabel(status)}</option>)}
            </Select>
            <Select
              label="Estado nuevo"
                value={orderFilters.toStatus}
                onChange={(event) => setOrderFilters((current) => ({ ...current, toStatus: event.target.value }))}
              >
                <option value="all">Todos</option>
                {ORDER_STATUSES.map((status) => <option key={status} value={status}>{getStatusLabel(status)}</option>)}
            </Select>
            <Button
              variant="secondary"
              onClick={() => setOrderFilters(emptyOrderHistoryFilters)}
              className="self-end"
            >
              Limpiar filtros
            </Button>
          </div>
          <p className="mt-3 text-af-body-sm text-academy-text-muted" aria-live="polite">
            {filteredOrderHistory.length} de {orderHistory.length} registros
          </p>
          </CardContent>
        </Card>

        {loading ? (
          <HistoryLoader />
        ) : !loaded ? (
          <UiEmptyState icon={<Clock3 className="h-8 w-8" />} title="Historial pendiente de cargar" description="Usa “Cargar / actualizar” para consultar el historial reciente." />
        ) : orderHistory.length === 0 ? (
          <UiEmptyState icon={<Clock3 className="h-8 w-8" />} title="Sin transiciones" description="No hay transiciones de órdenes para mostrar." />
        ) : filteredOrderHistory.length === 0 ? (
          <UiEmptyState icon={<Clock3 className="h-8 w-8" />} title="Sin coincidencias" description="No hay transiciones que coincidan con los filtros." />
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

function HistoryLoader() {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-af-lg border border-academy-border bg-academy-surface" role="status" aria-label="Cargando historial">
      <Loader2 className="h-8 w-8 animate-spin text-academy-primary" aria-hidden="true" />
    </div>
  );
}
