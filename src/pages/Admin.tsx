import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  MessageSquare,
  PackageCheck,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ServiceDetails } from '../components/ServiceDetails';
import type { Category, Json, Order, Service, SupportMessage } from '../lib/database.types';

type AdminTab = 'dashboard' | 'services' | 'orders' | 'support' | 'credentials';

type EditableService = Service & { draftPrice: string };

type NewService = {
  name: string;
  description: string;
  price: string;
  categoryId: string;
};

type RevealedCredential = {
  credentialId: string;
  orderId: string;
  serviceId: string;
  decrypted: {
    platformEmail?: string;
    platformPassword?: string;
    aleksAccount?: string;
    additionalInfo?: string;
  };
};

type CredentialMetadata = {
  credentialId: string;
  orderId: string;
  serviceId: string;
  serviceName: string;
  createdAt: string;
  expiresAt: string | null;
  deletedAt: string | null;
  hasEncryptedPayload: boolean;
};

// Los mensajes del motor de base de datos exponen nombres de tablas, restricciones
// y políticas, así que se registran en la consola y en pantalla se muestra un texto fijo.
function reportError(context: string, detail: unknown): string {
  console.error(`${context}:`, detail);
  return `${context}. Inténtalo de nuevo o recarga el panel.`;
}

const emptyService: NewService = {
  name: '',
  description: '',
  price: '',
  categoryId: '',
};

export function Admin() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [categories, setCategories] = useState<Category[]>([]);
  const [services, setServices] = useState<EditableService[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [newService, setNewService] = useState<NewService>(emptyService);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revealedCredential, setRevealedCredential] = useState<RevealedCredential | null>(null);
  const [revealLoadingId, setRevealLoadingId] = useState<string | null>(null);
  const [revealError, setRevealError] = useState('');
  const [credentialRows, setCredentialRows] = useState<CredentialMetadata[]>([]);
  const [credentialsLoading, setCredentialsLoading] = useState(false);

  const loadData = async () => {
    if (!isAdmin) return;

    setLoading(true);
    setError('');

    const [categoriesSettled, servicesSettled, ordersSettled, messagesSettled] =
      await Promise.allSettled([
        supabase.from('categories').select('*').order('name'),
        supabase.from('services').select('*').order('created_at', { ascending: false }),
        supabase.from('orders').select(`
          *,
          items:order_items(
            *,
            service:services(*, category:categories(*))
          )
        `).order('created_at', { ascending: false }),
        supabase.from('support_messages').select('*').order('created_at', { ascending: false }),
      ]);

    const categoriesResult = categoriesSettled.status === 'fulfilled' ? categoriesSettled.value : null;
    const servicesResult = servicesSettled.status === 'fulfilled' ? servicesSettled.value : null;
    const ordersResult = ordersSettled.status === 'fulfilled' ? ordersSettled.value : null;
    const messagesResult = messagesSettled.status === 'fulfilled' ? messagesSettled.value : null;

    const errors: string[] = [];
    if (!categoriesResult || categoriesResult.error) errors.push('categorías');
    if (!servicesResult || servicesResult.error) errors.push('servicios');
    if (!ordersResult || ordersResult.error) errors.push('órdenes');
    if (!messagesResult || messagesResult.error) {
      errors.push('mensajes');
      console.error('No se pudieron cargar los mensajes:', messagesResult?.error);
    }

    if (errors.length > 0) {
      setError(`No se pudieron cargar: ${errors.join(', ')}. Recarga el panel.`);
    }

    setCategories(categoriesResult?.data ?? []);
    setServices(
      (servicesResult?.data ?? []).map((service) => ({
        ...service,
        draftPrice: String(service.price),
      })),
    );
    setOrders(ordersResult?.data ?? []);
    setMessages(messagesResult?.data ?? []);
    setNewService((current) => ({
      ...current,
      categoryId: current.categoryId || categoriesResult?.data?.[0]?.id || '',
    }));
    setResponseDrafts(
      Object.fromEntries(
        (messagesResult?.data ?? []).map((message) => [message.id, message.admin_response ?? '']),
      ),
    );
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) void loadData();
  }, [isAdmin]);

  const metrics = useMemo(() => {
    const completedOrders = orders.filter((order) => order.status === 'completed');

    return {
      revenue: completedOrders.reduce((sum, order) => sum + Number(order.total_amount), 0),
      orders: orders.length,
      pendingOrders: orders.filter((order) => order.status === 'pending').length,
      activeServices: services.filter((service) => service.is_active).length,
      pendingSupport: messages.filter((message) => message.status !== 'resolved').length,
    };
  }, [orders, services, messages]);

  const categoryName = (categoryId: string) =>
    categories.find((category) => category.id === categoryId)?.name ?? 'Sin categoría';

  const logAction = async (
    action: string,
    targetTable: string,
    targetId?: string,
    details: Json = {},
  ) => {
    if (!user) return;

    await supabase.from('admin_activity_log').insert({
      admin_id: user.id,
      action,
      target_table: targetTable,
      target_id: targetId ?? null,
      details,
    });
  };

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2500);
  };

  const handleCreateCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;

    setSavingId('new-category');
    const { data, error: insertError } = await supabase
      .from('categories')
      .insert({ name })
      .select()
      .single();

    if (insertError) {
      setError(reportError('No se pudo crear la categoría', insertError));
    } else if (data) {
      setCategories((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewService((current) => ({ ...current, categoryId: current.categoryId || data.id }));
      setNewCategoryName('');
      await logAction('create', 'categories', data.id, { name: data.name });
      showNotice('Categoría creada');
    }

    setSavingId(null);
  };

  const handleCreateService = async (event: React.FormEvent) => {
    event.preventDefault();
    const price = Number(newService.price);

    if (!newService.name.trim() || !newService.categoryId || !Number.isFinite(price) || price < 0) {
      setError('Completa el nombre, la categoría y un precio válido.');
      return;
    }

    setSavingId('new-service');
    setError('');

    const { data, error: insertError } = await supabase
      .from('services')
      .insert({
        name: newService.name.trim(),
        description: newService.description.trim() || null,
        price,
        category_id: newService.categoryId,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      setError(reportError('No se pudo crear el servicio', insertError));
    } else if (data) {
      setServices((current) => [{ ...data, draftPrice: String(data.price) }, ...current]);
      setNewService({ ...emptyService, categoryId: newService.categoryId });
      await logAction('create', 'services', data.id, { name: data.name, price: data.price });
      showNotice('Servicio creado');
    }

    setSavingId(null);
  };

  const handleSaveService = async (service: EditableService) => {
    const price = Number(service.draftPrice);
    if (!Number.isFinite(price) || price < 0) {
      setError('El precio debe ser un número igual o mayor que cero.');
      return;
    }

    setSavingId(service.id);
    const { data, error: updateError } = await supabase
      .from('services')
      .update({
        name: service.name.trim(),
        description: service.description?.trim() || null,
        category_id: service.category_id,
        price,
        is_active: service.is_active,
      })
      .eq('id', service.id)
      .select()
      .single();

    if (updateError) {
      setError(reportError('No se pudo guardar el servicio', updateError));
    } else if (data) {
      setServices((current) =>
        current.map((item) =>
          item.id === data.id ? { ...data, draftPrice: String(data.price) } : item,
        ),
      );
      await logAction('update', 'services', data.id, {
        name: data.name,
        price: data.price,
        is_active: data.is_active,
      });
      showNotice('Servicio actualizado');
    }

    setSavingId(null);
  };

  const handleDeleteService = async (service: EditableService) => {
    const confirmed = window.confirm(
      `¿Eliminar “${service.name}”? Si ya fue comprado, la base de datos puede impedirlo para conservar el historial.`,
    );
    if (!confirmed) return;

    setSavingId(service.id);
    const { error: deleteError } = await supabase.from('services').delete().eq('id', service.id);

    if (deleteError) {
      if (deleteError.code === '23503') {
        const { error: deactivateError } = await supabase
          .from('services')
          .update({ is_active: false })
          .eq('id', service.id);

        if (deactivateError) {
          console.error('No se pudo desactivar el servicio:', { code: deactivateError.code });
          setError(reportError('No se pudo eliminar el servicio', deactivateError));
        } else {
          setServices((current) =>
            current.map((item) => (item.id === service.id ? { ...item, is_active: false } : item)),
          );
          await logAction('deactivate', 'services', service.id, { name: service.name });
          showNotice(
            'Este servicio tiene historial de pedidos, por lo que no puede eliminarse. Se desactivó correctamente y ya no aparecerá para nuevos clientes.',
          );
        }
      } else {
        console.error('No se pudo eliminar el servicio:', { code: deleteError.code });
        setError(reportError('No se pudo eliminar el servicio', deleteError));
      }
    } else {
      setServices((current) => current.filter((item) => item.id !== service.id));
      await logAction('delete', 'services', service.id, { name: service.name });
      showNotice('Servicio eliminado');
    }

    setSavingId(null);
  };

  const handleOrderStatus = async (order: Order, status: Order['status']) => {
    setSavingId(order.id);

    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) {
        setError('Debes iniciar sesión para cambiar el estado de una orden.');
        setSavingId(null);
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/complete-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ orderId: order.id, status }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result?.error || 'No se pudo actualizar el estado de la orden.');
        setSavingId(null);
        return;
      }

      const updatedOrder = { ...order, status };
      setOrders((current) => current.map((item) => (item.id === order.id ? updatedOrder : item)));
      await logAction('status_change', 'orders', order.id, {
        previous_status: order.status,
        status,
      });
      showNotice('Estado de la orden actualizado');
    } catch (err) {
      setError('No se pudo actualizar el estado de la orden. Inténtalo de nuevo.');
    }

    setSavingId(null);
  };

  const loadCredentials = async () => {
    setCredentialsLoading(true);
    setRevealError('');

    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) {
        setRevealError('Debes iniciar sesión.');
        setCredentialsLoading(false);
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-order-credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const result = await response.json();

      if (!response.ok) {
        setRevealError(result?.error || 'No se pudieron cargar las credenciales.');
        setCredentialsLoading(false);
        return;
      }

      setCredentialRows(result.credentials ?? []);
    } catch {
      setRevealError('No se pudieron cargar las credenciales. Inténtalo de nuevo.');
    }

    setCredentialsLoading(false);
  };

  const handleRevealCredential = async (credentialId: string) => {
    const confirmed = window.confirm('¿Estás seguro de revelar las credenciales? Esta acción se registrará en el historial de auditoría.');
    if (!confirmed) return;

    setRevealLoadingId(credentialId);
    setRevealError('');

    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) {
        setRevealError('Debes iniciar sesión.');
        setRevealLoadingId(null);
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reveal-order-credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ credentialId }),
      });

      const result = await response.json();

      if (!response.ok) {
        setRevealError(result?.error || 'No se pudieron revelar las credenciales.');
        setRevealLoadingId(null);
        return;
      }

      setRevealedCredential(result);
      window.setTimeout(() => setRevealedCredential(null), 30000);
    } catch (err) {
      setRevealError('No se pudieron revelar las credenciales. Inténtalo de nuevo.');
    }

    setRevealLoadingId(null);
  };

  const handleSupportResponse = async (message: SupportMessage) => {
    const response = (responseDrafts[message.id] ?? '').trim();
    if (!response) {
      setError('Escribe una respuesta antes de guardar.');
      return;
    }

    setSavingId(message.id);
    const { data, error: updateError } = await supabase
      .from('support_messages')
      .update({
        admin_response: response,
        status: 'resolved',
        updated_at: new Date().toISOString(),
      })
      .eq('id', message.id)
      .select()
      .single();

    if (updateError) {
      setError(reportError('No se pudo guardar la respuesta', updateError));
    } else if (data) {
      setMessages((current) => current.map((item) => (item.id === data.id ? data : item)));
      await logAction('respond', 'support_messages', data.id, { status: data.status });
      showNotice('Respuesta guardada');
    }

    setSavingId(null);
  };

  if (authLoading) {
    return <CenteredLoader />;
  }

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <ShieldAlert size={64} className="mx-auto text-red-500 mb-4" />
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Acceso restringido</h1>
        <p className="text-gray-600">Esta sección solo está disponible para administradores.</p>
      </div>
    );
  }

  const tabs: { id: AdminTab; label: string; icon: typeof BarChart3 }[] = [
    { id: 'dashboard', label: 'Resumen', icon: BarChart3 },
    { id: 'services', label: 'Servicios', icon: Boxes },
    { id: 'orders', label: 'Órdenes', icon: PackageCheck },
    { id: 'support', label: 'Soporte', icon: MessageSquare },
    { id: 'credentials', label: 'Credenciales', icon: KeyRound },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <p className="text-sm font-semibold text-blue-600 uppercase tracking-wide">Administración</p>
          <h1 className="text-3xl font-bold text-gray-900">Panel de Academy Flow</h1>
          <p className="text-gray-600 mt-1">Gestiona catálogo, órdenes y mensajes de soporte.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw size={18} />
          Actualizar
        </button>
      </div>

      <div className="flex flex-wrap gap-2 border-b mb-8">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-3 font-medium border-b-2 transition ${
              tab === id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
          <button className="ml-3 underline" onClick={() => setError('')}>Cerrar</button>
        </div>
      )}

      {notice && (
        <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {notice}
        </div>
      )}

      {loading ? (
        <CenteredLoader />
      ) : (
        <>
          {tab === 'dashboard' && (
            <div className="space-y-8">
              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <MetricCard icon={CircleDollarSign} label="Ingresos confirmados" value={`$${metrics.revenue.toFixed(2)}`} />
                <MetricCard icon={PackageCheck} label="Órdenes" value={String(metrics.orders)} />
                <MetricCard icon={Loader2} label="Pendientes" value={String(metrics.pendingOrders)} />
                <MetricCard icon={Boxes} label="Servicios activos" value={String(metrics.activeServices)} />
                <MetricCard icon={MessageSquare} label="Soporte pendiente" value={String(metrics.pendingSupport)} />
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                <section className="bg-white rounded-xl shadow-sm border p-6">
                  <h2 className="font-bold text-lg mb-4">Órdenes recientes</h2>
                  <div className="space-y-3">
                    {orders.slice(0, 5).map((order) => (
                      <div key={order.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                        <div>
                          <p className="font-mono text-sm">#{order.id.slice(0, 8)}</p>
                          <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleString('es-MX')}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">${Number(order.total_amount).toFixed(2)}</p>
                          <StatusBadge status={order.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="bg-white rounded-xl shadow-sm border p-6">
                  <h2 className="font-bold text-lg mb-4">Estado del sistema</h2>
                  <div className="space-y-3 text-sm">
                    <SystemLine ok label="RLS y roles administrativos configurados" />
                    <SystemLine ok label="Precios calculados dentro de PostgreSQL" />
                    <SystemLine ok label="Órdenes creadas como pendientes" />
                    <SystemLine ok label="Credenciales cifradas con AES-256-GCM" />
                    <SystemLine label="Stripe todavía no está conectado" />
                  </div>
                </section>
              </div>
            </div>
          )}

          {tab === 'services' && (
            <div className="space-y-8">
              <div className="grid lg:grid-cols-3 gap-6">
                <form onSubmit={handleCreateCategory} className="bg-white border rounded-xl p-5 space-y-3">
                  <h2 className="font-bold text-lg">Nueva categoría</h2>
                  <input
                    value={newCategoryName}
                    onChange={(event) => setNewCategoryName(event.target.value)}
                    placeholder="Nombre de la categoría"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                  <button
                    disabled={savingId === 'new-category'}
                    className="w-full flex justify-center items-center gap-2 bg-gray-900 text-white rounded-lg py-2 disabled:opacity-50"
                  >
                    <Plus size={18} /> Crear categoría
                  </button>
                </form>

                <form onSubmit={handleCreateService} className="lg:col-span-2 bg-white border rounded-xl p-5 space-y-3">
                  <h2 className="font-bold text-lg">Nuevo servicio</h2>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <input
                      required
                      value={newService.name}
                      onChange={(event) => setNewService((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Nombre"
                      className="px-3 py-2 border rounded-lg"
                    />
                    <select
                      required
                      value={newService.categoryId}
                      onChange={(event) => setNewService((current) => ({ ...current, categoryId: event.target.value }))}
                      className="px-3 py-2 border rounded-lg"
                    >
                      <option value="">Selecciona categoría</option>
                      {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={newService.price}
                      onChange={(event) => setNewService((current) => ({ ...current, price: event.target.value }))}
                      placeholder="Precio"
                      className="px-3 py-2 border rounded-lg"
                    />
                    <input
                      value={newService.description}
                      onChange={(event) => setNewService((current) => ({ ...current, description: event.target.value }))}
                      placeholder="Descripción"
                      className="px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <button
                    disabled={savingId === 'new-service'}
                    className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg disabled:opacity-50"
                  >
                    <Plus size={18} /> Crear servicio
                  </button>
                </form>
              </div>

              <div className="bg-white border rounded-xl overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-gray-50 text-left">
                    <tr>
                      <th className="p-4">Servicio</th>
                      <th className="p-4">Categoría</th>
                      <th className="p-4">Precio</th>
                      <th className="p-4">Activo</th>
                      <th className="p-4">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((service) => (
                      <tr key={service.id} className="border-t align-top">
                        <td className="p-4 space-y-2">
                          <input
                            value={service.name}
                            onChange={(event) => setServices((current) => current.map((item) => item.id === service.id ? { ...item, name: event.target.value } : item))}
                            className="w-full font-semibold px-2 py-1 border rounded"
                          />
                          <textarea
                            value={service.description ?? ''}
                            onChange={(event) => setServices((current) => current.map((item) => item.id === service.id ? { ...item, description: event.target.value } : item))}
                            className="w-full px-2 py-1 border rounded text-gray-600"
                            rows={2}
                          />
                        </td>
                        <td className="p-4">
                          <select
                            value={service.category_id}
                            onChange={(event) => setServices((current) => current.map((item) => item.id === service.id ? { ...item, category_id: event.target.value } : item))}
                            className="px-2 py-1 border rounded"
                          >
                            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                          </select>
                          <p className="text-xs text-gray-500 mt-2">{categoryName(service.category_id)}</p>
                        </td>
                        <td className="p-4">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={service.draftPrice}
                            onChange={(event) => setServices((current) => current.map((item) => item.id === service.id ? { ...item, draftPrice: event.target.value } : item))}
                            className="w-28 px-2 py-1 border rounded"
                          />
                        </td>
                        <td className="p-4">
                          <input
                            type="checkbox"
                            checked={service.is_active}
                            onChange={(event) => setServices((current) => current.map((item) => item.id === service.id ? { ...item, is_active: event.target.checked } : item))}
                            className="w-5 h-5"
                          />
                        </td>
                        <td className="p-4">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => void handleSaveService(service)}
                              disabled={savingId === service.id}
                              className="p-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
                              title="Guardar"
                            >
                              <Save size={18} />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteService(service)}
                              disabled={savingId === service.id}
                              className="p-2 bg-red-50 text-red-700 rounded-lg disabled:opacity-50"
                              title="Eliminar"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'orders' && (
            <div className="bg-white border rounded-xl overflow-x-auto">
              <table className="w-full min-w-[850px] text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="p-4">Orden</th>
                    <th className="p-4">Usuario</th>
                    <th className="p-4">Fecha</th>
                    <th className="p-4">Servicios</th>
                    <th className="p-4">Total</th>
                    <th className="p-4">Método</th>
                    <th className="p-4">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-t align-top">
                      <td className="p-4 font-mono">#{order.id.slice(0, 8)}</td>
                      <td className="p-4 font-mono text-xs">{order.user_id.slice(0, 8)}…</td>
                      <td className="p-4">{new Date(order.created_at).toLocaleString('es-MX')}</td>
                      <td className="p-4">
                        {(order as any).items?.map((item: any) => (
                          <div key={item.id} className="mb-2 last:mb-0">
                            <p className="font-medium text-sm">{item.service?.name}</p>
                            <ServiceDetails
                              serviceName={item.service?.name ?? ''}
                              categoryName={(item.service as any)?.category?.name ?? ''}
                              details={item.details}
                            />
                          </div>
                        ))}
                      </td>
                      <td className="p-4 font-semibold">${Number(order.total_amount).toFixed(2)}</td>
                      <td className="p-4 capitalize">{order.payment_method}</td>
                      <td className="p-4">
                        <select
                          value={order.status}
                          disabled={savingId === order.id}
                          onChange={(event) => void handleOrderStatus(order, event.target.value as Order['status'])}
                          className="px-3 py-2 border rounded-lg"
                        >
                          <option value="pending">Pendiente</option>
                          <option value="completed">Completada</option>
                          <option value="cancelled">Cancelada</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'credentials' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Las credenciales están cifradas. Revelarlas genera un registro de auditoría.
                </p>
                <button
                  type="button"
                  onClick={() => void loadCredentials()}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <RefreshCw size={18} />
                  Cargar
                </button>
              </div>

              {revealError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                  {revealError}
                </div>
              )}

              {revealedCredential && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold flex items-center gap-2">
                      <Eye size={18} className="text-blue-600" />
                      Credenciales reveladas
                    </h3>
                    <button
                      type="button"
                      onClick={() => setRevealedCredential(null)}
                      className="p-1 hover:bg-blue-100 rounded"
                      title="Ocultar"
                    >
                      <EyeOff size={18} />
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">Se ocultarán automáticamente en 30 segundos.</p>
                  <dl className="space-y-2 text-sm">
                    {revealedCredential.decrypted.platformEmail && (
                      <div><dt className="font-semibold inline">Correo: </dt><dd className="inline font-mono">{revealedCredential.decrypted.platformEmail}</dd></div>
                    )}
                    {revealedCredential.decrypted.platformPassword && (
                      <div><dt className="font-semibold inline">Contraseña: </dt><dd className="inline font-mono">{revealedCredential.decrypted.platformPassword}</dd></div>
                    )}
                    {revealedCredential.decrypted.aleksAccount && (
                      <div><dt className="font-semibold inline">Cuenta ALEKS: </dt><dd className="inline font-mono">{revealedCredential.decrypted.aleksAccount}</dd></div>
                    )}
                    {revealedCredential.decrypted.additionalInfo && (
                      <div><dt className="font-semibold inline">Info adicional: </dt><dd className="inline">{revealedCredential.decrypted.additionalInfo}</dd></div>
                    )}
                  </dl>
                </div>
              )}

              {credentialsLoading ? (
                <CenteredLoader />
              ) : credentialRows.length === 0 ? (
                <div className="bg-white border rounded-xl p-10 text-center text-gray-500">
                  No hay credenciales. Haz clic en "Cargar" para ver las credenciales existentes.
                </div>
              ) : (
                <div className="bg-white border rounded-xl overflow-x-auto">
                  <table className="w-full min-w-[700px] text-sm">
                    <thead className="bg-gray-50 text-left">
                      <tr>
                        <th className="p-4">Credencial</th>
                        <th className="p-4">Orden</th>
                        <th className="p-4">Servicio</th>
                        <th className="p-4">Estado</th>
                        <th className="p-4">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {credentialRows.map((cred) => {
                        const isDeleted = cred.deletedAt !== null;
                        const isExpired = cred.expiresAt !== null && new Date(cred.expiresAt) < new Date();
                        return (
                          <tr key={cred.credentialId} className="border-t align-top">
                            <td className="p-4 font-mono text-xs">{cred.credentialId.slice(0, 8)}…</td>
                            <td className="p-4 font-mono text-xs">{cred.orderId.slice(0, 8)}…</td>
                            <td className="p-4">{cred.serviceName}</td>
                            <td className="p-4">
                              {isDeleted ? (
                                <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-800">Eliminada</span>
                              ) : isExpired ? (
                                <span className="text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-800">Vencida</span>
                              ) : (
                                <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800">Cifrada</span>
                              )}
                            </td>
                            <td className="p-4">
                              <button
                                type="button"
                                onClick={() => void handleRevealCredential(cred.credentialId)}
                                disabled={isDeleted || isExpired || revealLoadingId === cred.credentialId}
                                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg disabled:opacity-50"
                              >
                                {revealLoadingId === cred.credentialId ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
                                Revelar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'support' && (
            <div className="space-y-4">
              {messages.length === 0 ? (
                <div className="bg-white border rounded-xl p-10 text-center text-gray-500">No hay mensajes.</div>
              ) : messages.map((message) => (
                <article key={message.id} className="bg-white border rounded-xl p-5">
                  <div className="flex flex-wrap justify-between gap-3 mb-4">
                    <div>
                      <h2 className="font-bold">{message.user_name}</h2>
                      <p className="text-sm text-gray-500">{message.user_email}</p>
                    </div>
                    <span className="text-xs font-semibold px-3 py-1 bg-gray-100 rounded-full h-fit">{message.status}</span>
                  </div>
                  <p className="bg-blue-50 rounded-lg p-4 text-gray-800 mb-4">{message.message}</p>
                  <textarea
                    value={responseDrafts[message.id] ?? ''}
                    onChange={(event) => setResponseDrafts((current) => ({ ...current, [message.id]: event.target.value }))}
                    placeholder="Respuesta del administrador"
                    className="w-full border rounded-lg p-3 min-h-24"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSupportResponse(message)}
                    disabled={savingId === message.id}
                    className="mt-3 flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                  >
                    <Save size={18} /> Guardar respuesta y resolver
                  </button>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CenteredLoader() {
  return (
    <div className="min-h-64 flex items-center justify-center">
      <Loader2 size={40} className="animate-spin text-blue-600" />
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white border rounded-xl p-5 shadow-sm">
      <Icon size={24} className="text-blue-600 mb-3" />
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: Order['status'] }) {
  const classes = {
    pending: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  }[status];

  return <span className={`text-xs px-2 py-1 rounded-full ${classes}`}>{status}</span>;
}

function SystemLine({ ok = false, label }: { ok?: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3">
      {ok ? <CheckCircle2 size={18} className="text-green-600" /> : <ShieldAlert size={18} className="text-yellow-600" />}
      <span>{label}</span>
    </div>
  );
}
