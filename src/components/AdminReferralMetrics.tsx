import { useCallback, useEffect, useMemo, useState } from 'react';
import { Gift, Loader2, RefreshCw, TicketCheck, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  SearchBar,
  Select,
  StatCard,
} from './ui';
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Badge variant="primary">Solo lectura</Badge>
          <p className="mt-1 text-af-body-sm text-academy-text-muted">
            Visibilidad operativa de solo lectura protegida por admin y AAL2.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => void loadReferralMetrics()}
          loading={loading}
          leadingIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
        >
          {loading ? 'Cargando…' : 'Actualizar'}
        </Button>
      </div>

      {error && <Alert variant="error" role="alert">{error}</Alert>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<Gift className="h-5 w-5" />} label="Códigos creados" value={metrics.codesTotal} />
        <StatCard icon={<TicketCheck className="h-5 w-5" />} label="Códigos utilizados" value={metrics.codesUsed} />
        <StatCard icon={<Users className="h-5 w-5" />} label="Usos totales" value={metrics.usesTotal} />
        <StatCard
          icon={<TicketCheck className="h-5 w-5" />}
          label="Descuento en muestra reciente"
          value={`$${metrics.recentDiscount.toFixed(2)}`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card><CardContent className="flex items-center justify-between gap-4 p-4"><span className="text-sm text-academy-text-muted">Códigos sin uso</span><strong className="text-lg text-academy-text">{metrics.codesUnused}</strong></CardContent></Card>
        <Card><CardContent className="flex items-center justify-between gap-4 p-4"><span className="text-sm text-academy-text-muted">Clientes en muestra reciente</span><strong className="text-lg text-academy-text">{metrics.recentCustomers}</strong></CardContent></Card>
      </div>

      <Alert variant="info">
        Los conteos son globales. El detalle y las métricas de muestra usan hasta los 100 códigos y 100 usos más recientes.
      </Alert>

      <Card>
        <CardContent>
        <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(190px,1fr)_auto]">
          <div>
            <label htmlFor="admin-referral-search" className="mb-1.5 block text-af-label text-academy-text">Buscar referidos</label>
            <SearchBar
              id="admin-referral-search"
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              onClear={() => setFilters((current) => ({ ...current, search: '' }))}
              placeholder="Código, propietario u orden reciente"
            />
          </div>
          <Select
            label="Uso"
              value={filters.usage}
              onChange={(event) => setFilters((current) => ({
                ...current,
                usage: event.target.value as AdminReferralFilters['usage'],
              }))}
            >
              <option value="all">Todos</option>
              <option value="with_uses">Con usos</option>
              <option value="without_uses">Sin usos</option>
          </Select>
          <Button
            variant="secondary"
            onClick={() => setFilters(emptyAdminReferralFilters)}
            className="self-end"
          >
            Limpiar filtros
          </Button>
        </div>
        <p className="mt-3 text-af-body-sm text-academy-text-muted" aria-live="polite">
          {filteredCodes.length} de {codes.length} códigos cargados
        </p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex min-h-48 items-center justify-center rounded-af-lg border border-academy-border bg-academy-surface" role="status" aria-label="Cargando referidos">
          <Loader2 className="h-9 w-9 animate-spin text-academy-primary" aria-hidden="true" />
        </div>
      ) : codes.length === 0 ? (
        <EmptyState icon={<Gift className="h-8 w-8" />} title="Sin códigos de referido" description="No hay códigos de referido para mostrar." />
      ) : filteredCodes.length === 0 ? (
        <EmptyState icon={<Gift className="h-8 w-8" />} title="Sin coincidencias" description="No hay códigos que coincidan con los filtros." />
      ) : (
        <>
        <div className="hidden overflow-x-auto rounded-af-lg border border-academy-border bg-white shadow-af-card lg:block">
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
        <div className="space-y-3 lg:hidden">
          {filteredCodes.map((code) => {
            const codeUses = getRecentUsesForCode(code.id, recentUses);
            const recentDiscount = codeUses.reduce((total, use) => total + Number(use.discount_amount), 0);
            return (
              <Card key={code.id}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono font-bold text-academy-primary">{code.code}</p>
                      <p className="mt-1 font-mono text-xs text-academy-text-muted">{shortId(code.user_id)}</p>
                    </div>
                    <Badge variant={(code.uses_count ?? 0) > 0 ? 'success' : 'neutral'}>{(code.uses_count ?? 0) > 0 ? 'Con usos' : 'Sin uso'}</Badge>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-academy-border pt-4 text-sm">
                    <div><dt className="text-xs text-academy-text-muted">Usos totales</dt><dd className="mt-1 font-bold">{code.uses_count ?? 0}</dd></div>
                    <div><dt className="text-xs text-academy-text-muted">Descuento reciente</dt><dd className="mt-1 font-bold text-green-700">${recentDiscount.toFixed(2)}</dd></div>
                    <div className="col-span-2"><dt className="text-xs text-academy-text-muted">Creado</dt><dd className="mt-1 text-xs">{formatDate(code.created_at)}</dd></div>
                  </dl>
                </CardContent>
              </Card>
            );
          })}
        </div>
        </>
      )}
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
