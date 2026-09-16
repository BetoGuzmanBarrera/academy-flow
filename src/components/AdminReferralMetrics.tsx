import { useCallback, useEffect, useMemo, useState } from 'react';
import { Gift, Loader2, RefreshCw, TicketCheck, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  calculateAdminReferralMetrics,
  emptyAdminReferralFilters,
  filterAdminReferralCodes,
  getRecentUsesForCode,
} from '../lib/adminReferralMetrics';
import type {
  AdminReferralFilters,
  AdminReferralMetrics as AdminReferralMetricValues,
} from '../lib/adminReferralMetrics';
import type { ReferralCode, ReferralUse } from '../lib/database.types';

const DATA_LIMIT = 100;

const emptyMetrics: AdminReferralMetricValues = {
  codesTotal: 0,
  codesUsed: 0,
  codesUnused: 0,
  usesTotal: 0,
  recentCustomers: 0,
  recentDiscount: 0,
};

export function AdminReferralMetrics() {
  const [codes, setCodes] = useState<ReferralCode[]>([]);
  const [recentUses, setRecentUses] = useState<ReferralUse[]>([]);
  const [metrics, setMetrics] = useState<AdminReferralMetricValues>(emptyMetrics);
  const [filters, setFilters] = useState<AdminReferralFilters>(emptyAdminReferralFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReferralMetrics = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [codesResult, usesResult, codeCountResult, usedCodeCountResult, useCountResult] = await Promise.all([
        supabase
          .from('referral_codes')
          .select('id, user_id, code, uses_count, created_at')
          .order('created_at', { ascending: false })
          .limit(DATA_LIMIT),
        supabase
          .from('referral_uses')
          .select('id, referral_code_id, used_by_user_id, order_id, discount_amount, created_at')
          .order('created_at', { ascending: false })
          .limit(DATA_LIMIT),
        supabase.from('referral_codes').select('id', { count: 'exact', head: true }),
        supabase.from('referral_codes').select('id', { count: 'exact', head: true }).gt('uses_count', 0),
        supabase.from('referral_uses').select('id', { count: 'exact', head: true }),
      ]);

      const queryError = codesResult.error
        ?? usesResult.error
        ?? codeCountResult.error
        ?? usedCodeCountResult.error
        ?? useCountResult.error;

      if (queryError) throw queryError;

      const loadedCodes = codesResult.data ?? [];
      const loadedUses = usesResult.data ?? [];
      setCodes(loadedCodes);
      setRecentUses(loadedUses);
      setMetrics(calculateAdminReferralMetrics({
        codesTotal: codeCountResult.count ?? 0,
        codesUsed: usedCodeCountResult.count ?? 0,
        usesTotal: useCountResult.count ?? 0,
      }, loadedUses));
    } catch (loadError) {
      console.error('No se pudieron cargar las métricas de referidos:', loadError);
      setCodes([]);
      setRecentUses([]);
      setMetrics(emptyMetrics);
      setError('No se pudieron cargar los referidos. Verifica tu sesión AAL2 e inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReferralMetrics();
  }, [loadReferralMetrics]);

  const filteredCodes = useMemo(
    () => filterAdminReferralCodes(codes, recentUses, filters),
    [codes, recentUses, filters],
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Referidos y métricas</h2>
          <p className="text-sm text-gray-600">
            Visibilidad operativa de solo lectura protegida por admin y AAL2.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadReferralMetrics()}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
          {loading ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <ReferralMetricCard icon={Gift} label="Códigos creados" value={metrics.codesTotal} />
        <ReferralMetricCard icon={TicketCheck} label="Códigos utilizados" value={metrics.codesUsed} />
        <ReferralMetricCard icon={Gift} label="Códigos sin uso" value={metrics.codesUnused} />
        <ReferralMetricCard icon={Users} label="Usos totales" value={metrics.usesTotal} />
        <ReferralMetricCard icon={Users} label="Clientes en muestra reciente" value={metrics.recentCustomers} />
        <ReferralMetricCard
          icon={TicketCheck}
          label="Descuento en muestra reciente"
          value={`$${metrics.recentDiscount.toFixed(2)}`}
        />
      </div>

      <p className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">
        Los conteos son globales. El detalle y las métricas de muestra usan hasta los 100 códigos y 100 usos más recientes.
      </p>

      <div className="rounded-xl border bg-white p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(190px,1fr)_auto]">
          <label className="space-y-1 text-sm font-medium text-gray-700">
            <span>Buscar referidos</span>
            <input
              type="search"
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Código, propietario u orden reciente"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-gray-700">
            <span>Uso</span>
            <select
              value={filters.usage}
              onChange={(event) => setFilters((current) => ({
                ...current,
                usage: event.target.value as AdminReferralFilters['usage'],
              }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
            >
              <option value="all">Todos</option>
              <option value="with_uses">Con usos</option>
              <option value="without_uses">Sin usos</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setFilters(emptyAdminReferralFilters)}
            className="self-end rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Limpiar filtros
          </button>
        </div>
        <p className="mt-3 text-sm text-gray-500">
          {filteredCodes.length} de {codes.length} códigos cargados
        </p>
      </div>

      {loading ? (
        <div className="flex min-h-48 items-center justify-center rounded-xl border bg-white">
          <Loader2 size={36} className="animate-spin text-blue-600" />
        </div>
      ) : codes.length === 0 ? (
        <EmptyState message="No hay códigos de referido para mostrar." />
      ) : filteredCodes.length === 0 ? (
        <EmptyState message="No hay códigos que coincidan con los filtros." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-4">Código</th>
                <th className="p-4">Propietario</th>
                <th className="p-4">Creado</th>
                <th className="p-4">Usos</th>
                <th className="p-4">Órdenes recientes</th>
                <th className="p-4">Descuento reciente</th>
              </tr>
            </thead>
            <tbody>
              {filteredCodes.map((code) => {
                const codeUses = getRecentUsesForCode(code.id, recentUses);
                const recentDiscount = codeUses.reduce(
                  (total, use) => total + Number(use.discount_amount),
                  0,
                );
                return (
                  <tr key={code.id} className="border-t align-top">
                    <td className="p-4 font-mono font-semibold text-blue-700">{code.code}</td>
                    <td className="p-4 font-mono text-xs text-gray-600">{shortId(code.user_id)}</td>
                    <td className="p-4 text-xs text-gray-600">{formatDate(code.created_at)}</td>
                    <td className="p-4">
                      <p className="font-semibold text-gray-900">{code.uses_count ?? 0} totales</p>
                      <p className="text-xs text-gray-500">{codeUses.length} en la muestra</p>
                    </td>
                    <td className="p-4">
                      {codeUses.length === 0 ? (
                        <span className="text-gray-400">Sin usos en la muestra</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {codeUses.slice(0, 3).map((use) => (
                            <span key={use.id} className="rounded-full bg-gray-100 px-2 py-1 font-mono text-xs">
                              {shortId(use.order_id)}
                            </span>
                          ))}
                          {codeUses.length > 3 && (
                            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs">+{codeUses.length - 3}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="p-4 font-semibold text-green-700">${recentDiscount.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReferralMetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Gift;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <Icon size={22} className="mb-3 text-blue-600" />
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function shortId(value: string): string {
  return value.length > 8 ? `${value.slice(0, 8)}…` : value;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha inválida' : date.toLocaleString('es-MX');
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-xl border bg-white p-10 text-center text-gray-500">{message}</div>;
}
