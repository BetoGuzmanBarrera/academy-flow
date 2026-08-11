import { useEffect, useState } from 'react';
import { Package, Calendar, DollarSign, CreditCard, Loader2, AlertCircle, CheckCircle2, Clock, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ServiceDetails } from '../components/ServiceDetails';
import { PersonalizedHelp } from '../components/PersonalizedHelp';
import { openSupportChat } from '../components/SupportChat';
import type { Order, OrderItem, Service } from '../lib/database.types';

interface OrderWithItems extends Order {
  items: (OrderItem & { service: Service })[];
}

export function Orders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadOrders();
  }, [user]);

  const loadOrders = async () => {
    if (!user) {
      setOrders([]);
      setLoading(false);
      return;
    }

    const { data: ordersData } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (ordersData) {
      const ordersWithItems = await Promise.all(
        ordersData.map(async (order) => {
          const { data: items } = await supabase
            .from('order_items')
            .select(`
              *,
              service:services(*, category:categories(*))
            `)
            .eq('order_id', order.id);

          return {
            ...order,
            items: items || [],
          };
        })
      );

      setOrders(ordersWithItems as any);
    }

    setLoading(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completado';
      case 'in_progress':
        return 'En proceso';
      case 'pending':
        return 'Pendiente';
      case 'cancelled':
        return 'Cancelado';
      default:
        return status;
    }
  };

  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState('');

  const handleRetryPayment = async (orderId: string) => {
    setPaymentError('');
    setPayingOrderId(orderId);

    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) {
        setPaymentError('Debes iniciar sesión para pagar.');
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ orderId }),
      });

      const result = await response.json();

      if (!response.ok || !result?.sessionUrl) {
        setPaymentError(result?.error || 'No se pudo iniciar el pago. Inténtalo de nuevo.');
        return;
      }

      window.location.href = result.sessionUrl;
    } catch {
      setPaymentError('No se pudo iniciar el pago. Inténtalo de nuevo.');
    } finally {
      setPayingOrderId(null);
    }
  };

  const getPaymentStatusBadge = (paymentStatus: string) => {
    switch (paymentStatus) {
      case 'paid':
        return { icon: CheckCircle2, color: 'bg-green-100 text-green-800', label: 'Pagado' };
      case 'pending':
        return { icon: Clock, color: 'bg-yellow-100 text-yellow-800', label: 'Pendiente' };
      case 'failed':
        return { icon: AlertCircle, color: 'bg-red-100 text-red-800', label: 'Fallido' };
      case 'refunded':
        return { icon: RefreshCw, color: 'bg-purple-100 text-purple-800', label: 'Reembolsado' };
      default:
        return { icon: Clock, color: 'bg-gray-100 text-gray-800', label: paymentStatus };
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Mis Órdenes</h1>
        <p className="text-gray-600">Historial completo de tus compras</p>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white rounded-lg shadow-lg p-12 text-center">
          <Package size={64} className="text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            No tienes órdenes aún
          </h2>
          <p className="text-gray-600">
            Cuando realices una compra, aparecerá aquí
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {orders.map((order) => (
            <div key={order.id} className="bg-white rounded-lg shadow-lg overflow-hidden">
              <div className="bg-gray-50 px-6 py-4 border-b flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center space-x-4">
                  <div>
                    <p className="text-sm text-gray-600">Orden</p>
                    <p className="font-mono text-sm font-semibold">
                      #{order.id.slice(0, 8)}
                    </p>
                  </div>

                  <div className="flex items-center space-x-2 text-gray-600">
                    <Calendar size={16} />
                    <span className="text-sm">
                      {new Date(order.created_at).toLocaleDateString('es-ES', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                      order.status
                    )}`}
                  >
                    {getStatusText(order.status)}
                  </span>

                  {(() => {
                    const ps = getPaymentStatusBadge(order.payment_status);
                    const PSIcon = ps.icon;
                    return (
                      <span className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${ps.color}`}>
                        <PSIcon size={12} />
                        {ps.label}
                      </span>
                    );
                  })()}

                  <div className="flex items-center space-x-2 text-gray-600">
                    <CreditCard size={16} />
                    <span className="text-sm capitalize">{order.payment_method}</span>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="space-y-3 mb-4">
                  {order.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex justify-between items-start py-3 border-b last:border-b-0"
                    >
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900">
                          {item.service.name}
                        </p>
                        <div className="my-1">
                          <ServiceDetails
                            serviceName={item.service.name}
                            categoryName={(item.service as any).category?.name ?? ''}
                            details={item.details}
                          />
                        </div>
                        <p className="text-sm text-gray-600">
                          ${item.unit_price.toFixed(2)} × {item.quantity}
                        </p>
                      </div>
                      <p className="font-bold text-blue-600">
                        ${(item.unit_price * item.quantity).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center pt-4 border-t">
                  <div className="flex items-center space-x-2 text-gray-700">
                    <DollarSign size={20} />
                    <span className="font-semibold">Total:</span>
                  </div>
                  <div className="flex items-center gap-4">
                    {['pending', 'failed'].includes(order.payment_status) &&
                      order.status !== 'cancelled' && (
                      <button
                        onClick={() => handleRetryPayment(order.id)}
                        disabled={payingOrderId === order.id}
                        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50"
                      >
                        {payingOrderId === order.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <CreditCard size={16} />
                        )}
                        {order.payment_status === 'failed' ? 'Reintentar pago' : 'Pagar'}
                      </button>
                    )}
                    <span className="text-2xl font-bold text-blue-600">
                      ${order.total_amount.toFixed(2)}
                    </span>
                  </div>
                </div>

                {paymentError && payingOrderId === null && (
                  <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
                    {paymentError}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8">
        <PersonalizedHelp
          orderId={orders.length > 0 ? orders[0].id : undefined}
          onOpenInternalSupport={() => openSupportChat()}
        />
      </div>
    </div>
  );
}
