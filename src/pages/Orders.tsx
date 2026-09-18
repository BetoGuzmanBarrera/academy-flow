import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  DollarSign,
  LifeBuoy,
  Loader2,
  Package,
  RefreshCw,
} from 'lucide-react';
import type { QueryData } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ServiceDetails } from '../components/ServiceDetails';
import { PersonalizedHelp } from '../components/PersonalizedHelp';
import { openSupportChat } from '../components/SupportChat';
import { Alert, Badge, Button, Card, CardContent, CardHeader, EmptyState } from '../components/ui';
import { STRIPE_MINIMUM_MXN } from '../lib/stripeConstants';
import type { Order } from '../lib/database.types';
import type { BadgeVariant } from '../components/ui';

const getOrderItemsQuery = (orderId: string) =>
  supabase
    .from('order_items')
    .select(`
      *,
      service:services(*, category:categories(*))
    `)
    .eq('order_id', orderId);

type OrderItemWithService = QueryData<ReturnType<typeof getOrderItemsQuery>>[number];

interface OrderWithItems extends Order {
  items: OrderItemWithService[];
}

interface StatusPresentation {
  label: string;
  variant: BadgeVariant;
}

interface PaymentStatusPresentation extends StatusPresentation {
  icon: typeof Clock;
}

const orderStatusPresentations: Record<string, StatusPresentation> = {
  completed: { label: 'Completado', variant: 'success' },
  in_progress: { label: 'En proceso', variant: 'primary' },
  pending: { label: 'Pendiente', variant: 'warning' },
  cancelled: { label: 'Cancelado', variant: 'danger' },
};

const paymentStatusPresentations: Record<string, PaymentStatusPresentation> = {
  paid: { icon: CheckCircle2, label: 'Pagado', variant: 'success' },
  pending: { icon: Clock, label: 'Pendiente', variant: 'warning' },
  failed: { icon: AlertCircle, label: 'Fallido', variant: 'danger' },
  refunded: { icon: RefreshCw, label: 'Reembolsado', variant: 'neutral' },
};

const getOrderStatusPresentation = (status: string): StatusPresentation =>
  orderStatusPresentations[status] ?? { label: status || 'Sin estado', variant: 'neutral' };

const getPaymentStatusPresentation = (status: string): PaymentStatusPresentation =>
  paymentStatusPresentations[status] ?? {
    icon: Clock,
    label: status || 'Sin estado',
    variant: 'neutral',
  };

const canRetryPayment = (order: Order) =>
  (order.payment_status === 'pending' || order.payment_status === 'failed') &&
  order.status !== 'cancelled' &&
  Number(order.total_amount) >= STRIPE_MINIMUM_MXN;

const isBelowStripeMinimum = (order: Order) =>
  (order.payment_status === 'pending' || order.payment_status === 'failed') &&
  order.status !== 'cancelled' &&
  Number(order.total_amount) < STRIPE_MINIMUM_MXN;

export function Orders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<{ orderId: string; message: string } | null>(null);
  const [helpOrderId, setHelpOrderId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadOrders = async () => {
      if (!user) {
        setOrders([]);
        setLoadError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);

      try {
        const { data: ordersData, error: ordersError } = await supabase
          .from('orders')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (ordersError) throw ordersError;

        const ordersWithItems = await Promise.all(
          (ordersData ?? []).map(async (order) => {
            const { data: items, error: itemsError } = await getOrderItemsQuery(order.id);
            if (itemsError) throw itemsError;

            return {
              ...order,
              items: items || [],
            };
          }),
        );

        if (active) {
          setOrders(ordersWithItems);
        }
      } catch {
        if (active) {
          setOrders([]);
          setLoadError('No pudimos cargar tus órdenes. Inténtalo de nuevo.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadOrders();
    return () => {
      active = false;
    };
  }, [reloadKey, user]);

  const handleRetryPayment = async (orderId: string) => {
    if (payingOrderId !== null) return;

    setPaymentError(null);
    setPayingOrderId(orderId);

    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) {
        setPaymentError({ orderId, message: 'Debes iniciar sesión para pagar.' });
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ orderId }),
      });

      const result = await response.json();

      if (!response.ok || !result?.sessionUrl) {
        setPaymentError({
          orderId,
          message: 'No se pudo iniciar el pago. Inténtalo de nuevo.',
        });
        return;
      }

      window.location.href = result.sessionUrl;
    } catch {
      setPaymentError({
        orderId,
        message: 'No se pudo iniciar el pago. Inténtalo de nuevo.',
      });
    } finally {
      setPayingOrderId(null);
    }
  };

  return (
    <div className="min-h-full overflow-x-hidden bg-academy-background">
      <header className="border-b border-academy-border bg-academy-surface">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <Badge variant="primary">PEDIDOS</Badge>
          <h1 className="mt-4 text-4xl font-bold text-academy-text sm:text-af-h1">Mis órdenes</h1>
          <p className="mt-4 max-w-2xl text-af-body-lg text-academy-text-muted">
            Consulta el estado, los servicios y los pagos de tus pedidos.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {loading ? (
          <div
            role="status"
            aria-live="polite"
            className="flex min-h-64 flex-col items-center justify-center gap-3 text-academy-text-muted"
          >
            <Loader2 className="h-8 w-8 motion-safe:animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <p className="text-af-body-sm">Cargando tus órdenes…</p>
          </div>
        ) : loadError ? (
          <div className="mx-auto max-w-2xl">
            <Alert variant="error" role="alert" title="No se pudieron cargar las órdenes">
              {loadError}
            </Alert>
            <Button
              className="mt-4"
              variant="secondary"
              leadingIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
              onClick={() => setReloadKey((value) => value + 1)}
            >
              Reintentar
            </Button>
          </div>
        ) : orders.length === 0 ? (
          <EmptyState
            className="bg-academy-surface"
            icon={<Package className="h-12 w-12" />}
            title="No tienes órdenes todavía"
            description="Cuando realices una compra, podrás consultar aquí su estado y detalles."
          />
        ) : (
          <div className="space-y-6">
            {orders.map((order) => {
              const orderStatus = getOrderStatusPresentation(order.status);
              const paymentStatus = getPaymentStatusPresentation(order.payment_status);
              const PaymentStatusIcon = paymentStatus.icon;
              const isExpanded = expandedOrderId === order.id;
              const isPaying = payingOrderId === order.id;
              const itemCount = order.items.length;
              const detailsId = `order-details-${order.id}`;

              return (
                <Card key={order.id}>
                  <CardHeader className="space-y-4 bg-academy-subtle/60 sm:flex sm:items-start sm:justify-between sm:gap-6 sm:space-y-0">
                    <div className="min-w-0">
                      <p className="text-af-label-sm uppercase tracking-wide text-academy-text-muted">Orden</p>
                      <h2 className="mt-1 font-mono text-lg font-semibold text-academy-text">
                        #{order.id.slice(0, 8)}
                      </h2>
                      <p className="mt-2 flex items-center gap-2 text-af-body-sm text-academy-text-muted">
                        <Calendar className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {new Date(order.created_at).toLocaleDateString('es-ES', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2" aria-label="Estados de la orden y del pago">
                      <Badge variant={orderStatus.variant}>Orden: {orderStatus.label}</Badge>
                      <Badge variant={paymentStatus.variant} className="gap-1.5">
                        <PaymentStatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        Pago: {paymentStatus.label}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <dl className="grid gap-4 rounded-af-md border border-academy-border bg-academy-background p-4 sm:grid-cols-3">
                      <div>
                        <dt className="text-af-label-sm text-academy-text-muted">Método de pago</dt>
                        <dd className="mt-1 flex items-center gap-2 text-af-body-sm font-semibold capitalize text-academy-text">
                          <CreditCard className="h-4 w-4" aria-hidden="true" />
                          {order.payment_method}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-af-label-sm text-academy-text-muted">Servicios</dt>
                        <dd className="mt-1 text-af-body-sm font-semibold text-academy-text">
                          {itemCount} {itemCount === 1 ? 'servicio' : 'servicios'}
                        </dd>
                      </div>
                      <div className="sm:text-right">
                        <dt className="text-af-label-sm text-academy-text-muted">Total</dt>
                        <dd className="mt-1 flex items-center gap-1 text-xl font-bold text-academy-primary sm:justify-end">
                          <DollarSign className="h-5 w-5" aria-hidden="true" />
                          {order.total_amount.toFixed(2)} MXN
                        </dd>
                      </div>
                    </dl>

                    {isBelowStripeMinimum(order) && (
                      <Alert className="mt-4" variant="warning" title="Pago con tarjeta no disponible para este total">
                        El pago mínimo con tarjeta es de ${STRIPE_MINIMUM_MXN.toFixed(2)} MXN.
                      </Alert>
                    )}

                    {paymentError?.orderId === order.id && (
                      <Alert className="mt-4" variant="error" role="alert">
                        {paymentError.message}
                      </Alert>
                    )}

                    <div className="mt-5 flex flex-col gap-3 border-t border-academy-border pt-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                      <Button
                        variant="secondary"
                        aria-expanded={isExpanded}
                        aria-controls={detailsId}
                        trailingIcon={isExpanded ? (
                          <ChevronUp className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-4 w-4" aria-hidden="true" />
                        )}
                        onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                      >
                        {isExpanded ? 'Ocultar detalles' : 'Ver detalles'}
                      </Button>

                      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                        {canRetryPayment(order) && (
                          <Button
                            disabled={payingOrderId !== null}
                            aria-busy={isPaying}
                            leadingIcon={isPaying ? (
                              <Loader2 className="h-4 w-4 motion-safe:animate-spin motion-reduce:animate-none" aria-hidden="true" />
                            ) : (
                              <CreditCard className="h-4 w-4" aria-hidden="true" />
                            )}
                            onClick={() => handleRetryPayment(order.id)}
                          >
                            {order.payment_status === 'failed' ? 'Reintentar pago' : 'Pagar'}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          leadingIcon={<LifeBuoy className="h-4 w-4" aria-hidden="true" />}
                          aria-expanded={helpOrderId === order.id}
                          onClick={() => setHelpOrderId(helpOrderId === order.id ? null : order.id)}
                        >
                          Necesito ayuda con esta orden
                        </Button>
                      </div>
                    </div>

                    <div id={detailsId} hidden={!isExpanded} className="mt-6 border-t border-academy-border pt-6">
                      <h3 className="text-af-h4 text-academy-text">Detalle de la orden</h3>
                      <div className="mt-4 divide-y divide-academy-border rounded-af-md border border-academy-border">
                        {order.items.map((item) => (
                          <article key={item.id} className="p-4 sm:p-5">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0 flex-1">
                                <h4 className="font-semibold text-academy-text">{item.service.name}</h4>
                                <div className="mt-2">
                                  <ServiceDetails
                                    serviceName={item.service.name}
                                    categoryName={item.service.category?.name ?? ''}
                                    details={item.details}
                                  />
                                </div>
                              </div>
                              <dl className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-3 text-af-body-sm sm:min-w-72">
                                <div>
                                  <dt className="text-academy-text-muted">Precio unitario</dt>
                                  <dd className="mt-1 font-medium text-academy-text">${item.unit_price.toFixed(2)}</dd>
                                </div>
                                <div>
                                  <dt className="text-academy-text-muted">Cantidad</dt>
                                  <dd className="mt-1 font-medium text-academy-text">{item.quantity}</dd>
                                </div>
                                <div className="col-span-2 border-t border-academy-border pt-3 sm:text-right">
                                  <dt className="text-academy-text-muted">Subtotal</dt>
                                  <dd className="mt-1 font-bold text-academy-primary">
                                    ${(item.unit_price * item.quantity).toFixed(2)}
                                  </dd>
                                </div>
                              </dl>
                            </div>
                          </article>
                        ))}
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-4 border-t border-academy-border pt-4">
                        <span className="font-semibold text-academy-text">Total final</span>
                        <span className="text-xl font-bold text-academy-primary">
                          ${order.total_amount.toFixed(2)} MXN
                        </span>
                      </div>
                    </div>

                    {helpOrderId === order.id && (
                      <div className="mt-6 border-t border-academy-border pt-6">
                        <PersonalizedHelp
                          orderId={order.id}
                          onOpenInternalSupport={() => openSupportChat()}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div className="mt-8">
          <PersonalizedHelp onOpenInternalSupport={() => openSupportChat()} />
        </div>
      </main>
    </div>
  );
}
