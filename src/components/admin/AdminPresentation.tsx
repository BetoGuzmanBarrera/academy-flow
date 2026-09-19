import { CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import { Badge } from '../ui';
import type { CredentialLifecycleState } from '../../lib/adminCredentialAudit';
import type { Order, SupportMessage } from '../../lib/database.types';

export function CenteredLoader() {
  return (
    <div className="flex min-h-64 items-center justify-center" role="status" aria-label="Cargando panel administrativo">
      <Loader2 className="h-10 w-10 animate-spin text-academy-primary" aria-hidden="true" />
    </div>
  );
}

export function CredentialLifecycleBadge({ state }: { state: CredentialLifecycleState }) {
  const variants: Record<CredentialLifecycleState, 'success' | 'warning' | 'danger' | 'neutral'> = {
    available: 'success',
    expiring_soon: 'warning',
    expired: 'warning',
    deleted: 'danger',
    unavailable: 'neutral',
  };
  const labels: Record<CredentialLifecycleState, string> = {
    available: 'Vigente',
    expiring_soon: 'Próxima a expirar',
    expired: 'Expirada',
    deleted: 'Eliminada',
    unavailable: 'No disponible',
  };

  return <Badge variant={variants[state]}>{labels[state]}</Badge>;
}

export function AuditOutcomeBadge({ success }: { success: boolean }) {
  return <Badge variant={success ? 'success' : 'danger'}>{success ? 'Éxito' : 'Fallo'}</Badge>;
}

export function StatusBadge({ status }: { status: Order['status'] }) {
  const variants: Record<Order['status'], 'warning' | 'primary' | 'success' | 'danger'> = {
    pending: 'warning',
    in_progress: 'primary',
    completed: 'success',
    cancelled: 'danger',
  };

  const labels: Record<Order['status'], string> = {
    pending: 'Pendiente',
    in_progress: 'En proceso',
    completed: 'Completada',
    cancelled: 'Cancelada',
  };

  return (
    <Badge variant={variants[status]} aria-label={`Estado de orden: ${labels[status]}`}>
      {labels[status]}
    </Badge>
  );
}

export function PaymentBadge({ status }: { status: Order['payment_status'] }) {
  const variants: Record<Order['payment_status'], 'success' | 'warning' | 'danger' | 'neutral'> = {
    paid: 'success',
    pending: 'warning',
    failed: 'danger',
    refunded: 'neutral',
  };

  const labels: Record<Order['payment_status'], string> = {
    paid: 'Pagado',
    pending: 'Pendiente',
    failed: 'Fallido',
    refunded: 'Reembolsado',
  };

  return (
    <Badge variant={variants[status]} aria-label={`Estado de pago: ${labels[status]}`}>
      {labels[status]}
    </Badge>
  );
}

export function SupportStatusBadge({ status }: { status: SupportMessage['status'] }) {
  const variants: Record<SupportMessage['status'], 'warning' | 'primary' | 'success'> = {
    pending: 'warning',
    in_progress: 'primary',
    resolved: 'success',
  };
  const labels: Record<SupportMessage['status'], string> = {
    pending: 'Pendiente',
    in_progress: 'En proceso',
    resolved: 'Resuelto',
  };

  return (
    <Badge variant={variants[status]} aria-label={`Estado de soporte: ${labels[status]}`}>
      {labels[status]}
    </Badge>
  );
}

export function SystemLine({ ok = false, label }: { ok?: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3">
      {ok ? <CheckCircle2 size={18} className="text-green-600" aria-hidden="true" /> : <ShieldAlert size={18} className="text-yellow-600" aria-hidden="true" />}
      <span>{label}</span>
    </div>
  );
}
