import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  EyeOff,
  Gift,
  History,
  KeyRound,
  Loader2,
  MessageSquare,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import type { QueryData } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AdminMfaGate } from '../components/AdminMfaGate';
import { AdminActivityHistory } from '../components/AdminActivityHistory';
import { AdminReferralMetrics } from '../components/AdminReferralMetrics';
import { ServiceDetails } from '../components/ServiceDetails';
import {
  getOrderProcessingBlockReason,
  requiresOrderCancellationConfirmation,
  runOrderCancellationOnce,
} from '../lib/adminOrderCancellation';
import {
  emptyAdminOrderFilters,
  filterAdminOrders,
  hasActiveAdminOrderFilters,
} from '../lib/adminOrderFilters';
import type {
  AdminOrderFilters,
  AdminOrderStatusFilter,
  AdminPaymentStatusFilter,
} from '../lib/adminOrderFilters';
import {
  buildAdminSupportStatusUpdate,
  emptyAdminSupportFilters,
  filterAdminSupportMessages,
  hasActiveAdminSupportFilters,
} from '../lib/adminSupportFilters';
import type {
  AdminSupportFilters,
  AdminSupportStatusFilter,
} from '../lib/adminSupportFilters';
import {
  getAdminServiceStatusLabel,
  replaceAdminService,
  runCatalogMutationOnce,
  serviceToAdminDraft,
  validateAdminServiceDraft,
} from '../lib/adminCatalog';
import type { AdminServiceDraft } from '../lib/adminCatalog';
import {
  canRevealCredential,
  emptyAdminCredentialAuditFilters,
  emptyAdminCredentialFilters,
  filterAdminCredentials,
  filterCredentialAccessLogs,
  getCredentialLifecycleState,
  runCredentialRevealOnce,
} from '../lib/adminCredentialAudit';
import type {
  AdminCredentialAuditFilters,
  AdminCredentialFilters,
  AdminCredentialMetadata,
  CredentialAccessLogEntry,
  CredentialLifecycleState,
} from '../lib/adminCredentialAudit';
import type { Category, Json, Order, Service, SupportMessage } from '../lib/database.types';

const getAdminOrdersQuery = () =>
  supabase
    .from('orders')
    .select(`
      *,
      items:order_items(
        *,
        service:services(*, category:categories(*))
      )
    `)
    .order('created_at', { ascending: false });

type AdminOrder = QueryData<ReturnType<typeof getAdminOrdersQuery>>[number];

type AdminTab = 'dashboard' | 'services' | 'orders' | 'support' | 'credentials' | 'activity' | 'referrals';

type RevealedCredential = {
  credentialId: string;
  orderId: string;
  serviceId: string;
  decrypted: {
    platform?: string;
    accessMethod?: string;
    username?: string;
    email?: string;
    password?: string;
    additionalInfo?: string;
    platformEmail?: string;
    platformPassword?: string;
    aleksAccount?: string;
  };
};

function getCredentialFields(decrypted: RevealedCredential['decrypted']): {
  methodLabel?: string;
  fields: { label: string; value: string }[];
} {
  const fields: { label: string; value: string }[] = [];
  let methodLabel: string | undefined;

  const platform = decrypted.platform?.toUpperCase().trim() ?? '';
  const accessMethod = decrypted.accessMethod ?? '';

  const isLegacy = !decrypted.platform && (decrypted.platformEmail || decrypted.aleksAccount);

  if (isLegacy) {
    if (decrypted.aleksAccount) {
      fields.push({ label: 'Cuenta ALEKS', value: decrypted.aleksAccount });
    }
    if (decrypted.platformEmail) {
      fields.push({ label: 'Correo', value: decrypted.platformEmail });
    }
    if (decrypted.platformPassword) {
      fields.push({ label: 'Contraseña', value: decrypted.platformPassword });
    }
    if (decrypted.additionalInfo) {
      fields.push({ label: 'Información adicional', value: decrypted.additionalInfo });
    }
    return { fields };
  }

  if (platform === 'ALEKS UNIVERSIDAD' || platform === 'ALEKS PREPARATORIA') {
    if (accessMethod === 'aleks') {
      methodLabel = 'Cuenta ALEKS';
      if (decrypted.username) fields.push({ label: 'Usuario', value: decrypted.username });
    } else if (accessMethod === 'uvm_safekey') {
      methodLabel = 'UVM / SafeKey';
      if (decrypted.email) fields.push({ label: 'Correo institucional', value: decrypted.email });
    }
  } else if (platform === 'COURSERA EXCEL') {
    if (accessMethod === 'coursera') {
      methodLabel = 'Cuenta Coursera';
      if (decrypted.email) fields.push({ label: 'Correo', value: decrypted.email });
    } else if (accessMethod === 'uvm_safekey') {
      methodLabel = 'UVM / SafeKey';
      if (decrypted.email) fields.push({ label: 'Correo institucional', value: decrypted.email });
    }
  } else if (platform === 'CAMBRIDGE ONE') {
    if (decrypted.email) fields.push({ label: 'Correo electrónico', value: decrypted.email });
  } else if (platform === 'FRANCÉS — BIBLIO EXOS') {
    if (decrypted.username) fields.push({ label: 'Usuario', value: decrypted.username });
  }

  if (decrypted.password) fields.push({ label: 'Contraseña', value: decrypted.password });
  if (decrypted.additionalInfo) fields.push({ label: 'Información adicional', value: decrypted.additionalInfo });

  return { methodLabel, fields };
}

// Los mensajes del motor de base de datos exponen nombres de tablas, restricciones
// y políticas, así que se registran en la consola y en pantalla se muestra un texto fijo.
function reportError(context: string, detail: unknown): string {
  console.error(`${context}:`, detail);
  return `${context}. Inténtalo de nuevo o recarga el panel.`;
}

const emptyService: AdminServiceDraft = {
  name: '',
  description: '',
  price: '',
  categoryId: '',
  isActive: true,
};

export function Admin() {
  const { user, isAdmin, loading: authLoading } = useAuth();

  return (
    <AdminMfaGate
      key={user?.id ?? 'anonymous'}
      authLoading={authLoading}
      isAdmin={isAdmin}
      userId={user?.id ?? null}
    >
      <AdminDashboard />
    </AdminMfaGate>
  );
}

function AdminDashboard() {
  const { user, isAdmin } = useAuth();
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [categories, setCategories] = useState<Category[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [newService, setNewService] = useState<AdminServiceDraft>(emptyService);
  const [editingService, setEditingService] = useState<{
    id: string;
    draft: AdminServiceDraft;
  } | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revealedCredential, setRevealedCredential] = useState<RevealedCredential | null>(null);
  const [revealLoadingId, setRevealLoadingId] = useState<string | null>(null);
  const [revealError, setRevealError] = useState('');
  const [pendingRevealCredential, setPendingRevealCredential] = useState<AdminCredentialMetadata | null>(null);
  const [credentialRows, setCredentialRows] = useState<AdminCredentialMetadata[]>([]);
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [credentialAuditLogs, setCredentialAuditLogs] = useState<CredentialAccessLogEntry[]>([]);
  const [credentialAuditLoading, setCredentialAuditLoading] = useState(false);
  const [credentialAuditError, setCredentialAuditError] = useState('');
  const [credentialFilters, setCredentialFilters] = useState<AdminCredentialFilters>(emptyAdminCredentialFilters);
  const [credentialAuditFilters, setCredentialAuditFilters] = useState<AdminCredentialAuditFilters>(emptyAdminCredentialAuditFilters);
  const [pendingCancellationOrder, setPendingCancellationOrder] = useState<AdminOrder | null>(null);
  const [cancellationLoading, setCancellationLoading] = useState(false);
  const [cancellationError, setCancellationError] = useState('');
  const [orderFilters, setOrderFilters] = useState<AdminOrderFilters>(emptyAdminOrderFilters);
  const [supportFilters, setSupportFilters] = useState<AdminSupportFilters>(emptyAdminSupportFilters);
  const cancellationLock = useRef(false);
  const catalogMutationLock = useRef(false);
  const revealLock = useRef(false);
  const revealTimeout = useRef<number | null>(null);

  const loadData = useCallback(async () => {
    if (!isAdmin) return;

    setLoading(true);
    setError('');

    const [categoriesSettled, servicesSettled, ordersSettled, messagesSettled] =
      await Promise.allSettled([
        supabase.from('categories').select('*').order('name'),
        supabase.from('services').select('*').order('created_at', { ascending: false }),
        getAdminOrdersQuery(),
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
    setServices(servicesResult?.data ?? []);
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
  }, [isAdmin]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (tab !== 'credentials') {
      if (revealTimeout.current !== null) window.clearTimeout(revealTimeout.current);
      revealTimeout.current = null;
      setRevealedCredential(null);
      setPendingRevealCredential(null);
    }
  }, [tab]);

  useEffect(() => () => {
    if (revealTimeout.current !== null) window.clearTimeout(revealTimeout.current);
  }, []);

  const metrics = useMemo(() => {
    const paidOrders = orders.filter((order) => order.payment_status === 'paid');

    return {
      revenue: paidOrders.reduce((sum, order) => sum + Number(order.total_amount), 0),
      orders: orders.length,
      pendingOrders: orders.filter((order) => order.status === 'pending').length,
      activeServices: services.filter((service) => service.is_active).length,
      pendingSupport: messages.filter((message) => message.status !== 'resolved').length,
    };
  }, [orders, services, messages]);

  const filteredOrders = useMemo(
    () => filterAdminOrders(orders, orderFilters),
    [orders, orderFilters],
  );
  const orderFiltersActive = hasActiveAdminOrderFilters(orderFilters);
  const filteredMessages = useMemo(
    () => filterAdminSupportMessages(messages, supportFilters),
    [messages, supportFilters],
  );
  const supportFiltersActive = hasActiveAdminSupportFilters(supportFilters);
  const credentialRowsWithOrderStatus = useMemo(() => {
    const statusByOrderId = new Map(orders.map((order) => [order.id, order.status]));
    return credentialRows.map((credential) => ({
      ...credential,
      orderStatus: statusByOrderId.get(credential.orderId) ?? null,
    }));
  }, [credentialRows, orders]);
  const filteredCredentials = useMemo(
    () => filterAdminCredentials(credentialRowsWithOrderStatus, credentialFilters),
    [credentialRowsWithOrderStatus, credentialFilters],
  );
  const filteredCredentialAuditLogs = useMemo(
    () => filterCredentialAccessLogs(credentialAuditLogs, credentialAuditFilters),
    [credentialAuditLogs, credentialAuditFilters],
  );
  const credentialAuditActions = useMemo(
    () => [...new Set(credentialAuditLogs.map((entry) => entry.action))].sort(),
    [credentialAuditLogs],
  );

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
    const validation = validateAdminServiceDraft(newService);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    await runCatalogMutationOnce(catalogMutationLock, async () => {
      setSavingId('new-service');
      setError('');

      try {
        const { data, error: insertError } = await supabase
          .from('services')
          .insert(validation.payload)
          .select()
          .single();

        if (insertError) {
          setError(reportError('No se pudo crear el servicio', insertError));
        } else if (data) {
          setServices((current) => [data, ...current]);
          setNewService({ ...emptyService, categoryId: newService.categoryId });
          await logAction('create', 'services', data.id, {
            name: data.name,
            price: data.price,
            is_active: data.is_active,
          });
          showNotice('Servicio creado');
        }
      } finally {
        setSavingId(null);
      }
    });
  };

  const handleEditService = (service: Service) => {
    setError('');
    setEditingService({ id: service.id, draft: serviceToAdminDraft(service) });
  };

  const handleSaveService = async () => {
    if (!editingService) return;

    const validation = validateAdminServiceDraft(editingService.draft);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    await runCatalogMutationOnce(catalogMutationLock, async () => {
      setSavingId(editingService.id);
      setError('');

      try {
        const { data, error: updateError } = await supabase
          .from('services')
          .update(validation.payload)
          .eq('id', editingService.id)
          .select()
          .single();

        if (updateError) {
          setError(reportError('No se pudo guardar el servicio', updateError));
        } else if (data) {
          setServices((current) => replaceAdminService(current, data));
          await logAction('update', 'services', data.id, {
            name: data.name,
            price: data.price,
            is_active: data.is_active,
          });
          setEditingService(null);
          showNotice('Servicio actualizado');
        }
      } finally {
        setSavingId(null);
      }
    });
  };

  const performOrderStatusChange = async (order: Order, status: Order['status']): Promise<boolean> => {
    setSavingId(order.id);

    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) {
        setError('Debes iniciar sesión para cambiar el estado de una orden.');
        setSavingId(null);
        return false;
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
        return false;
      }

      // Reload all orders to get the server-side state (timestamps, payment_status, etc.)
      await loadData();
      await logAction('status_change', 'orders', order.id, {
        previous_status: order.status,
        status,
      });
      showNotice('Estado de la orden actualizado');
      setSavingId(null);
      return true;
    } catch {
      setError('No se pudo actualizar el estado de la orden. Inténtalo de nuevo.');
      setSavingId(null);
      return false;
    }
  };

  const handleOrderStatusSelection = async (order: AdminOrder, status: Order['status']) => {
    if (requiresOrderCancellationConfirmation(status)) {
      setCancellationError('');
      setPendingCancellationOrder(order);
      return;
    }

    if (order.status === 'pending' && status === 'in_progress') {
      setSavingId(order.id);
      try {
        const { data: currentOrder, error: paymentCheckError } = await supabase
          .from('orders')
          .select('status, payment_status')
          .eq('id', order.id)
          .single();

        if (paymentCheckError || !currentOrder) {
          setError('No se pudo verificar el estado del pago. Inténtalo de nuevo.');
          setSavingId(null);
          return;
        }

        const processingBlockReason = getOrderProcessingBlockReason(
          currentOrder.status,
          status,
          currentOrder.payment_status,
        );
        if (processingBlockReason) {
          setError(processingBlockReason);
          setSavingId(null);
          return;
        }
      } catch {
        setError('No se pudo verificar el estado del pago. Inténtalo de nuevo.');
        setSavingId(null);
        return;
      }
    }

    void performOrderStatusChange(order, status);
  };

  const handleConfirmOrderCancellation = async () => {
    const order = pendingCancellationOrder;
    if (!order || cancellationLock.current) return;

    setCancellationLoading(true);
    setCancellationError('');

    try {
      const updated = await runOrderCancellationOnce(cancellationLock, () =>
        performOrderStatusChange(order, 'cancelled'),
      );
      if (updated) {
        setPendingCancellationOrder(null);
      } else if (updated === false) {
        setCancellationError('No se pudo cancelar la orden. Su estado no cambió. Inténtalo de nuevo.');
      }
    } finally {
      setCancellationLoading(false);
    }
  };

  const loadCredentialAuditLogs = useCallback(async () => {
    setCredentialAuditLoading(true);
    setCredentialAuditError('');

    try {
      const { data, error: auditError } = await supabase
        .from('credential_access_log')
        .select('id, credential_id, order_id, requested_credential_id, action, success, reason_code, request_id, created_at')
        .order('created_at', { ascending: false })
        .limit(100);

      if (auditError) {
        console.error('No se pudo cargar la auditoría de credenciales:', auditError);
        setCredentialAuditLogs([]);
        setCredentialAuditError('No se pudo cargar el historial de accesos. Verifica tu sesión AAL2 e inténtalo de nuevo.');
      } else {
        setCredentialAuditLogs(data ?? []);
      }
    } catch {
      setCredentialAuditLogs([]);
      setCredentialAuditError('No se pudo cargar el historial de accesos. Verifica tu sesión AAL2 e inténtalo de nuevo.');
    } finally {
      setCredentialAuditLoading(false);
    }
  }, []);

  const loadCredentials = async () => {
    setCredentialsLoading(true);
    setRevealError('');
    if (revealTimeout.current !== null) window.clearTimeout(revealTimeout.current);
    revealTimeout.current = null;
    setRevealedCredential(null);
    setPendingRevealCredential(null);

    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) {
        setCredentialRows([]);
        setRevealError('Debes iniciar sesión.');
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
        setCredentialRows([]);
        setRevealError(result?.error || 'No se pudieron cargar las credenciales.');
        return;
      }

      const credentials = (result.credentials ?? []) as Omit<AdminCredentialMetadata, 'orderStatus'>[];
      setCredentialRows(credentials.map((credential) => ({
        ...credential,
        orderStatus: null,
      })));
      await loadCredentialAuditLogs();
    } catch {
      setCredentialRows([]);
      setRevealError('No se pudieron cargar las credenciales. Inténtalo de nuevo.');
    } finally {
      setCredentialsLoading(false);
    }
  };

  const handleRevealCredential = async (credential: AdminCredentialMetadata) => {
    await runCredentialRevealOnce(revealLock, async () => {
      setRevealLoadingId(credential.credentialId);
      setRevealError('');

      try {
        const session = await supabase.auth.getSession();
        const accessToken = session.data.session?.access_token;
        if (!accessToken) {
          setRevealError('Debes iniciar sesión.');
          return;
        }

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reveal-order-credentials`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ credentialId: credential.credentialId }),
        });

        const result = await response.json();
        await loadCredentialAuditLogs();

        if (!response.ok) {
          setRevealError(result?.error || 'No se pudieron revelar las credenciales.');
          return;
        }

        if (revealTimeout.current !== null) window.clearTimeout(revealTimeout.current);
        setRevealedCredential(result);
        setPendingRevealCredential(null);
        revealTimeout.current = window.setTimeout(() => {
          setRevealedCredential(null);
          revealTimeout.current = null;
        }, 30000);
      } catch {
        setRevealError('No se pudieron revelar las credenciales. Inténtalo de nuevo.');
      } finally {
        setRevealLoadingId(null);
      }
    });
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

  const handleSupportStatusChange = async (
    message: SupportMessage,
    status: SupportMessage['status'],
  ) => {
    if (status === message.status) return;

    setSavingId(message.id);
    setError('');
    const { data, error: updateError } = await supabase
      .from('support_messages')
      .update(buildAdminSupportStatusUpdate(status))
      .eq('id', message.id)
      .select()
      .single();

    if (updateError) {
      setError(reportError('No se pudo actualizar el estado del mensaje', updateError));
    } else if (data) {
      setMessages((current) => current.map((item) => (item.id === data.id ? data : item)));
      await logAction('update_status', 'support_messages', data.id, { status: data.status });
      showNotice('Estado del mensaje actualizado');
    }

    setSavingId(null);
  };

  const tabs: { id: AdminTab; label: string; icon: typeof BarChart3 }[] = [
    { id: 'dashboard', label: 'Resumen', icon: BarChart3 },
    { id: 'services', label: 'Servicios', icon: Boxes },
    { id: 'orders', label: 'Órdenes', icon: PackageCheck },
    { id: 'support', label: 'Soporte', icon: MessageSquare },
    { id: 'credentials', label: 'Credenciales', icon: KeyRound },
    { id: 'activity', label: 'Actividad', icon: History },
    { id: 'referrals', label: 'Referidos', icon: Gift },
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
                    <SystemLine ok label="Pagos con Stripe habilitados" />
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
                    <select
                      value={newService.isActive ? 'active' : 'inactive'}
                      onChange={(event) => setNewService((current) => ({
                        ...current,
                        isActive: event.target.value === 'active',
                      }))}
                      className="px-3 py-2 border rounded-lg"
                      aria-label="Disponibilidad inicial"
                    >
                      <option value="active">Activo</option>
                      <option value="inactive">Inactivo</option>
                    </select>
                  </div>
                  <button
                    disabled={savingId === 'new-service'}
                    className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg disabled:opacity-50"
                  >
                    {savingId === 'new-service' ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                    {savingId === 'new-service' ? 'Creando…' : 'Crear servicio'}
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
                    {services.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-10 text-center text-gray-500">
                          No hay servicios registrados todavía.
                        </td>
                      </tr>
                    ) : services.map((service) => (
                      <tr key={service.id} className="border-t align-middle">
                        <td className="p-4">
                          <p className="font-semibold text-gray-900">{service.name}</p>
                          <p className="mt-1 max-w-xl text-sm text-gray-600">
                            {service.description || 'Sin descripción'}
                          </p>
                        </td>
                        <td className="p-4">
                          {categoryName(service.category_id ?? '')}
                        </td>
                        <td className="p-4">
                          {Number(service.price).toLocaleString('es-MX', {
                            style: 'currency',
                            currency: 'MXN',
                          })}
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            service.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-200 text-gray-700'
                          }`}>
                            {getAdminServiceStatusLabel(service.is_active)}
                          </span>
                        </td>
                        <td className="p-4">
                          <button
                            type="button"
                            onClick={() => handleEditService(service)}
                            disabled={savingId !== null}
                            className="inline-flex items-center gap-2 rounded-lg border border-blue-200 px-3 py-2 font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                          >
                            <Pencil size={17} /> Editar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'orders' && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-white p-4">
                <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(160px,1fr)_minmax(160px,1fr)_auto]">
                  <label className="space-y-1 text-sm font-medium text-gray-700">
                    <span>Buscar órdenes</span>
                    <input
                      type="search"
                      value={orderFilters.search}
                      onChange={(event) => setOrderFilters((current) => ({
                        ...current,
                        search: event.target.value,
                      }))}
                      placeholder="Buscar por orden o servicio"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
                    />
                  </label>

                  <label className="space-y-1 text-sm font-medium text-gray-700">
                    <span>Estado de orden</span>
                    <select
                      value={orderFilters.status}
                      onChange={(event) => setOrderFilters((current) => ({
                        ...current,
                        status: event.target.value as AdminOrderStatusFilter,
                      }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
                    >
                      <option value="all">Todos</option>
                      <option value="pending">Pendientes</option>
                      <option value="in_progress">En proceso</option>
                      <option value="completed">Completadas</option>
                      <option value="cancelled">Canceladas</option>
                    </select>
                  </label>

                  <label className="space-y-1 text-sm font-medium text-gray-700">
                    <span>Estado de pago</span>
                    <select
                      value={orderFilters.paymentStatus}
                      onChange={(event) => setOrderFilters((current) => ({
                        ...current,
                        paymentStatus: event.target.value as AdminPaymentStatusFilter,
                      }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
                    >
                      <option value="all">Todos</option>
                      <option value="paid">Pagado</option>
                      <option value="pending">Pendiente</option>
                      <option value="failed">Fallido</option>
                      <option value="refunded">Reembolsado</option>
                    </select>
                  </label>

                  {orderFiltersActive && (
                    <button
                      type="button"
                      onClick={() => setOrderFilters(emptyAdminOrderFilters)}
                      className="self-end rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Limpiar filtros
                    </button>
                  )}
                </div>

                <p className="mt-3 text-sm text-gray-600" aria-live="polite">
                  Mostrando {filteredOrders.length} de {orders.length} órdenes
                </p>
              </div>

              <div className="overflow-x-auto rounded-xl border bg-white">
                <table className="w-full min-w-[850px] text-sm">
                  <thead className="bg-gray-50 text-left">
                    <tr>
                      <th className="p-4">Orden</th>
                      <th className="p-4">Usuario</th>
                      <th className="p-4">Fecha</th>
                      <th className="p-4">Servicios</th>
                      <th className="p-4">Total</th>
                      <th className="p-4">Método</th>
                      <th className="p-4">Estado de pago</th>
                      <th className="p-4">Estado de orden</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.length === 0 ? (
                      <tr className="border-t">
                        <td colSpan={8} className="p-8 text-center text-gray-500">
                          No se encontraron órdenes con estos filtros.
                        </td>
                      </tr>
                    ) : filteredOrders.map((order) => (
                      <tr key={order.id} className="border-t align-top">
                        <td className="p-4 font-mono">#{order.id.slice(0, 8)}</td>
                        <td className="p-4 font-mono text-xs">{order.user_id.slice(0, 8)}…</td>
                        <td className="p-4">{new Date(order.created_at).toLocaleString('es-MX')}</td>
                        <td className="p-4">
                          {order.items?.map((item) => (
                            <div key={item.id} className="mb-2 last:mb-0">
                              <p className="font-medium text-sm">{item.service?.name}</p>
                              <ServiceDetails
                                serviceName={item.service?.name ?? ''}
                                categoryName={item.service.category?.name ?? ''}
                                details={item.details}
                              />
                            </div>
                          ))}
                        </td>
                        <td className="p-4 font-semibold">${Number(order.total_amount).toFixed(2)}</td>
                        <td className="p-4 capitalize">{order.payment_method}</td>
                        <td className="p-4">
                          <PaymentBadge status={order.payment_status} />
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <StatusBadge status={order.status} />
                            {getOrderTransitions(order.status).length > 0 ? (
                              <select
                                value={order.status}
                                disabled={savingId === order.id}
                                onChange={(event) => void handleOrderStatusSelection(order, event.target.value as Order['status'])}
                                className="px-3 py-2 border rounded-lg text-sm"
                                aria-label={`Cambiar estado de la orden ${order.id.slice(0, 8)}`}
                              >
                                <option value={order.status} disabled>Cambiar estado…</option>
                                {getOrderTransitions(order.status).map((t) => (
                                  <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-xs text-gray-400">Sin acciones</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'credentials' && (
            <div className="space-y-8">
              <section className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Credenciales cifradas</h2>
                    <p className="text-sm text-gray-600">
                      El contenido solo se obtiene tras una confirmación explícita y cada intento queda auditado.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadCredentials()}
                    disabled={credentialsLoading || credentialAuditLoading}
                    className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {(credentialsLoading || credentialAuditLoading) ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                    {(credentialsLoading || credentialAuditLoading) ? 'Cargando…' : 'Cargar / actualizar'}
                  </button>
                </div>

                {revealError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
                    {revealError}
                  </div>
                )}

                {revealedCredential && (() => {
                  const { methodLabel, fields } = getCredentialFields(revealedCredential.decrypted);
                  return (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
                      <div className="mb-3 flex items-start justify-between gap-4">
                        <div>
                          <h3 className="flex items-center gap-2 font-bold">
                            <Eye size={18} className="text-blue-600" />
                            Credencial revelada
                          </h3>
                          <p className="mt-1 text-xs text-gray-600">
                            Orden #{shortId(revealedCredential.orderId)} · {credentialRowsWithOrderStatus.find((item) => item.credentialId === revealedCredential.credentialId)?.serviceName ?? 'Servicio no identificado'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (revealTimeout.current !== null) window.clearTimeout(revealTimeout.current);
                            revealTimeout.current = null;
                            setRevealedCredential(null);
                          }}
                          className="rounded p-1 hover:bg-blue-100"
                          title="Ocultar"
                          aria-label="Ocultar credencial revelada"
                        >
                          <EyeOff size={18} />
                        </button>
                      </div>
                      <p className="mb-3 text-xs text-gray-500">Se ocultarán automáticamente en 30 segundos.</p>
                      {fields.length === 0 && !methodLabel ? (
                        <p className="text-sm text-gray-600">La credencial no contiene campos visibles reconocidos.</p>
                      ) : (
                        <dl className="space-y-2 break-words text-sm">
                          {methodLabel && (
                            <div><dt className="inline font-semibold">Método: </dt><dd className="inline font-mono">{methodLabel}</dd></div>
                          )}
                          {fields.map((field) => (
                            <div key={field.label}><dt className="inline font-semibold">{field.label}: </dt><dd className="inline font-mono">{field.value}</dd></div>
                          ))}
                        </dl>
                      )}
                    </div>
                  );
                })()}

                <div className="rounded-xl border bg-white p-4">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(190px,1fr)_auto]">
                    <label className="space-y-1 text-sm font-medium text-gray-700">
                      <span>Buscar credenciales</span>
                      <input
                        type="search"
                        value={credentialFilters.search}
                        onChange={(event) => setCredentialFilters((current) => ({ ...current, search: event.target.value }))}
                        placeholder="Orden, servicio o credencial"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-gray-700">
                      <span>Estado</span>
                      <select
                        value={credentialFilters.state}
                        onChange={(event) => setCredentialFilters((current) => ({
                          ...current,
                          state: event.target.value as AdminCredentialFilters['state'],
                        }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
                      >
                        <option value="all">Todos</option>
                        <option value="available">Vigentes</option>
                        <option value="expiring_soon">Próximas a expirar</option>
                        <option value="expired">Expiradas</option>
                        <option value="deleted">Eliminadas</option>
                        <option value="unavailable">No disponibles</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => setCredentialFilters(emptyAdminCredentialFilters)}
                      className="self-end rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Limpiar
                    </button>
                  </div>
                  <p className="mt-3 text-sm text-gray-500">
                    {filteredCredentials.length} de {credentialRows.length} credenciales
                  </p>
                </div>

                {credentialsLoading ? (
                  <CenteredLoader />
                ) : credentialRows.length === 0 ? (
                  <div className="rounded-xl border bg-white p-10 text-center text-gray-500">
                    No hay credenciales registradas. Usa “Cargar / actualizar” para consultar el inventario seguro.
                  </div>
                ) : filteredCredentials.length === 0 ? (
                  <div className="rounded-xl border bg-white p-10 text-center text-gray-500">
                    No hay credenciales que coincidan con los filtros.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border bg-white">
                    <table className="w-full min-w-[1180px] text-sm">
                      <thead className="bg-gray-50 text-left">
                        <tr>
                          <th className="p-4">Credencial / orden</th>
                          <th className="p-4">Servicio</th>
                          <th className="p-4">Orden</th>
                          <th className="p-4">Credencial</th>
                          <th className="p-4">Fechas</th>
                          <th className="p-4">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCredentials.map((credential) => {
                          const lifecycle = getCredentialLifecycleState(credential);
                          const revealable = canRevealCredential(credential);
                          return (
                            <tr key={credential.credentialId} className="border-t align-top">
                              <td className="p-4">
                                <p className="font-mono text-xs">Cred. {shortId(credential.credentialId)}</p>
                                <p className="mt-1 font-mono text-xs text-gray-500">Orden {shortId(credential.orderId)}</p>
                              </td>
                              <td className="p-4">
                                <p className="font-medium text-gray-900">{credential.serviceName}</p>
                                <p className="mt-1 font-mono text-xs text-gray-500">{shortId(credential.serviceId)}</p>
                              </td>
                              <td className="p-4">
                                {credential.orderStatus ? <StatusBadge status={credential.orderStatus} /> : <span className="text-gray-400">No disponible</span>}
                              </td>
                              <td className="p-4"><CredentialLifecycleBadge state={lifecycle} /></td>
                              <td className="space-y-1 p-4 text-xs text-gray-600">
                                <p><span className="font-semibold">Creada:</span> {formatAdminDate(credential.createdAt)}</p>
                                <p><span className="font-semibold">Actualizada:</span> {formatAdminDate(credential.updatedAt)}</p>
                                <p><span className="font-semibold">Expira:</span> {formatAdminDate(credential.expiresAt)}</p>
                                {credential.deletedAt && <p><span className="font-semibold">Eliminada:</span> {formatAdminDate(credential.deletedAt)}</p>}
                              </td>
                              <td className="p-4">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRevealError('');
                                    setPendingRevealCredential(credential);
                                  }}
                                  disabled={!revealable || revealLoadingId !== null}
                                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {revealLoadingId === credential.credentialId ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
                                  Revelar
                                </button>
                                {!revealable && <p className="mt-2 max-w-36 text-xs text-gray-500">No hay material vigente para revelar.</p>}
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
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Auditoría de accesos</h2>
                  <p className="text-sm text-gray-600">
                    Se muestran los 100 registros más recientes permitidos por la policy admin+AAL2.
                  </p>
                </div>

                {credentialAuditError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
                    {credentialAuditError}
                  </div>
                )}

                <div className="rounded-xl border bg-white p-4">
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(180px,1fr)_minmax(180px,1fr)_auto]">
                    <label className="space-y-1 text-sm font-medium text-gray-700">
                      <span>Buscar auditoría</span>
                      <input
                        type="search"
                        value={credentialAuditFilters.search}
                        onChange={(event) => setCredentialAuditFilters((current) => ({ ...current, search: event.target.value }))}
                        placeholder="Orden, credencial, request o motivo"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-gray-700">
                      <span>Acción</span>
                      <select
                        value={credentialAuditFilters.action}
                        onChange={(event) => setCredentialAuditFilters((current) => ({ ...current, action: event.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
                      >
                        <option value="all">Todas</option>
                        {credentialAuditActions.map((action) => <option key={action} value={action}>{action}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1 text-sm font-medium text-gray-700">
                      <span>Resultado</span>
                      <select
                        value={credentialAuditFilters.outcome}
                        onChange={(event) => setCredentialAuditFilters((current) => ({
                          ...current,
                          outcome: event.target.value as AdminCredentialAuditFilters['outcome'],
                        }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
                      >
                        <option value="all">Todos</option>
                        <option value="success">Éxito</option>
                        <option value="failure">Fallo</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => setCredentialAuditFilters(emptyAdminCredentialAuditFilters)}
                      className="self-end rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Limpiar
                    </button>
                  </div>
                  <p className="mt-3 text-sm text-gray-500">
                    {filteredCredentialAuditLogs.length} de {credentialAuditLogs.length} registros cargados
                  </p>
                </div>

                {credentialAuditLoading ? (
                  <CenteredLoader />
                ) : credentialAuditLogs.length === 0 ? (
                  <div className="rounded-xl border bg-white p-10 text-center text-gray-500">
                    No hay registros de auditoría para mostrar.
                  </div>
                ) : filteredCredentialAuditLogs.length === 0 ? (
                  <div className="rounded-xl border bg-white p-10 text-center text-gray-500">
                    No hay registros que coincidan con los filtros.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border bg-white">
                    <table className="w-full min-w-[1180px] text-sm">
                      <thead className="bg-gray-50 text-left">
                        <tr>
                          <th className="p-4">Fecha</th>
                          <th className="p-4">Acción</th>
                          <th className="p-4">Resultado</th>
                          <th className="p-4">Orden / credencial</th>
                          <th className="p-4">Solicitada</th>
                          <th className="p-4">Motivo / request</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCredentialAuditLogs.map((entry) => (
                          <tr key={entry.id} className="border-t align-top">
                            <td className="p-4 text-xs text-gray-600">{formatAdminDate(entry.created_at)}</td>
                            <td className="p-4"><span className="rounded-full bg-gray-100 px-2 py-1 font-mono text-xs text-gray-800">{entry.action}</span></td>
                            <td className="p-4"><AuditOutcomeBadge success={entry.success} /></td>
                            <td className="space-y-1 p-4 font-mono text-xs">
                              <p>Orden: {shortId(entry.order_id)}</p>
                              <p>Cred.: {shortId(entry.credential_id)}</p>
                            </td>
                            <td className="p-4 font-mono text-xs">{shortId(entry.requested_credential_id)}</td>
                            <td className="space-y-1 p-4 text-xs text-gray-600">
                              <p><span className="font-semibold">Motivo:</span> {entry.reason_code ?? '—'}</p>
                              <p className="font-mono"><span className="font-sans font-semibold">Request:</span> {shortId(entry.request_id)}</p>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}

          {tab === 'activity' && <AdminActivityHistory />}

          {tab === 'referrals' && <AdminReferralMetrics />}

          {tab === 'support' && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-white p-4">
                <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(180px,1fr)_auto]">
                  <label className="space-y-1 text-sm font-medium text-gray-700">
                    <span>Buscar mensajes</span>
                    <input
                      type="search"
                      value={supportFilters.search}
                      onChange={(event) => setSupportFilters((current) => ({
                        ...current,
                        search: event.target.value,
                      }))}
                      placeholder="Mensaje, usuario, nombre o correo"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
                    />
                  </label>

                  <label className="space-y-1 text-sm font-medium text-gray-700">
                    <span>Estado</span>
                    <select
                      value={supportFilters.status}
                      onChange={(event) => setSupportFilters((current) => ({
                        ...current,
                        status: event.target.value as AdminSupportStatusFilter,
                      }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
                    >
                      <option value="all">Todos</option>
                      <option value="pending">Pendientes</option>
                      <option value="in_progress">En proceso</option>
                      <option value="resolved">Resueltos</option>
                    </select>
                  </label>

                  {supportFiltersActive && (
                    <button
                      type="button"
                      onClick={() => setSupportFilters(emptyAdminSupportFilters)}
                      className="self-end rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Limpiar filtros
                    </button>
                  )}
                </div>

                <p className="mt-3 text-sm text-gray-600" aria-live="polite">
                  Mostrando {filteredMessages.length} de {messages.length} mensajes
                </p>
              </div>

              {filteredMessages.length === 0 ? (
                <div className="bg-white border rounded-xl p-10 text-center text-gray-500">
                  {messages.length === 0
                    ? 'No hay mensajes de soporte.'
                    : 'No se encontraron mensajes con estos filtros.'}
                </div>
              ) : filteredMessages.map((message) => (
                <article key={message.id} className="bg-white border rounded-xl p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                    <div>
                      <h2 className="font-bold">{message.user_name}</h2>
                      <p className="text-sm text-gray-500">{message.user_email}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {message.user_id ? `Usuario #${message.user_id.slice(0, 8)}` : 'Mensaje de invitado'}
                        {' · '}
                        {new Date(message.created_at).toLocaleString('es-MX')}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <SupportStatusBadge status={message.status} />
                      <label className="sr-only" htmlFor={`support-status-${message.id}`}>
                        Estado del mensaje de {message.user_name}
                      </label>
                      <select
                        id={`support-status-${message.id}`}
                        value={message.status}
                        disabled={savingId === message.id}
                        onChange={(event) => void handleSupportStatusChange(
                          message,
                          event.target.value as SupportMessage['status'],
                        )}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
                      >
                        <option value="pending">Pendiente</option>
                        <option value="in_progress">En proceso</option>
                        <option value="resolved">Resuelto</option>
                      </select>
                    </div>
                  </div>
                  <p className="bg-blue-50 rounded-lg p-4 text-gray-800 mb-4 whitespace-pre-wrap">{message.message}</p>
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
                    {savingId === message.id ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    Guardar respuesta y resolver
                  </button>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {pendingRevealCredential && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reveal-credential-title"
            aria-describedby="reveal-credential-description"
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-blue-100 p-2 text-blue-700">
                <KeyRound size={24} />
              </div>
              <div>
                <h2 id="reveal-credential-title" className="text-xl font-bold text-gray-900">
                  Confirmar revelado de credencial
                </h2>
                <p id="reveal-credential-description" className="mt-2 text-sm text-gray-700">
                  Esta acción descifrará temporalmente la credencial y quedará registrada en la auditoría.
                </p>
                <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                  <p><span className="font-semibold">Orden:</span> #{shortId(pendingRevealCredential.orderId)}</p>
                  <p className="mt-1"><span className="font-semibold">Servicio:</span> {pendingRevealCredential.serviceName}</p>
                </div>
              </div>
            </div>

            {revealError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {revealError}
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingRevealCredential(null)}
                disabled={revealLoadingId !== null}
                className="rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={() => void handleRevealCredential(pendingRevealCredential)}
                disabled={revealLoadingId !== null}
                className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {revealLoadingId === pendingRevealCredential.credentialId ? <Loader2 size={18} className="animate-spin" /> : <Eye size={18} />}
                {revealLoadingId === pendingRevealCredential.credentialId ? 'Revelando…' : 'Revelar credencial'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-service-title"
            className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="edit-service-title" className="text-xl font-bold text-gray-900">
                  Editar servicio
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  Actualiza sus datos o desactívalo para ocultarlo a nuevos clientes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingService(null);
                  setError('');
                }}
                disabled={savingId === editingService.id}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                aria-label="Cerrar edición"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium text-gray-700 sm:col-span-2">
                <span>Nombre</span>
                <input
                  required
                  value={editingService.draft.name}
                  onChange={(event) => setEditingService((current) => current ? {
                    ...current,
                    draft: { ...current.draft, name: event.target.value },
                  } : current)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">
                <span>Categoría</span>
                <select
                  required
                  value={editingService.draft.categoryId}
                  onChange={(event) => setEditingService((current) => current ? {
                    ...current,
                    draft: { ...current.draft, categoryId: event.target.value },
                  } : current)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
                >
                  <option value="">Selecciona categoría</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700">
                <span>Precio (MXN)</span>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={editingService.draft.price}
                  onChange={(event) => setEditingService((current) => current ? {
                    ...current,
                    draft: { ...current.draft, price: event.target.value },
                  } : current)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700 sm:col-span-2">
                <span>Descripción</span>
                <textarea
                  value={editingService.draft.description}
                  onChange={(event) => setEditingService((current) => current ? {
                    ...current,
                    draft: { ...current.draft, description: event.target.value },
                  } : current)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-gray-700 sm:col-span-2">
                <span>Disponibilidad</span>
                <select
                  value={editingService.draft.isActive ? 'active' : 'inactive'}
                  onChange={(event) => setEditingService((current) => current ? {
                    ...current,
                    draft: { ...current.draft, isActive: event.target.value === 'active' },
                  } : current)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 font-normal"
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
                <p className="text-xs font-normal text-gray-500">
                  Los servicios inactivos conservan su historial y no están disponibles para nuevas compras.
                </p>
              </label>
            </div>

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setEditingService(null);
                  setError('');
                }}
                disabled={savingId === editingService.id}
                className="rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSaveService()}
                disabled={savingId === editingService.id}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingId === editingService.id ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                {savingId === editingService.id ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingCancellationOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancel-order-title"
            aria-describedby="cancel-order-description"
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-red-100 p-2 text-red-700">
                <ShieldAlert size={24} />
              </div>
              <div>
                <h2 id="cancel-order-title" className="text-xl font-bold text-gray-900">
                  ¿Cancelar la orden #{pendingCancellationOrder.id.slice(0, 8)}?
                </h2>
                <p id="cancel-order-description" className="mt-3 text-gray-700">
                  Cancelar esta orden eliminará de forma irreversible las credenciales asociadas.
                </p>
                <p className="mt-2 font-semibold text-red-700">Esta acción no se puede deshacer.</p>
                <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                  <span className="font-semibold">Servicios:</span>{' '}
                  {getOrderServiceSummary(pendingCancellationOrder)}
                </div>
              </div>
            </div>

            {cancellationError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {cancellationError}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingCancellationOrder(null)}
                disabled={cancellationLoading}
                className="rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmOrderCancellation()}
                disabled={cancellationLoading}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cancellationLoading ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                {cancellationLoading ? 'Cancelando…' : 'Cancelar orden'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getOrderServiceSummary(order: AdminOrder): string {
  const serviceNames = order.items
    ?.map((item) => item.service?.name)
    .filter((name): name is string => Boolean(name));

  return serviceNames?.length ? serviceNames.join(', ') : 'Sin servicios identificados';
}

function CenteredLoader() {
  return (
    <div className="min-h-64 flex items-center justify-center">
      <Loader2 size={40} className="animate-spin text-blue-600" />
    </div>
  );
}

function shortId(value: string | null): string {
  if (!value) return '—';
  return value.length > 8 ? `${value.slice(0, 8)}…` : value;
}

function formatAdminDate(value: string | null): string {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha inválida' : date.toLocaleString('es-MX');
}

function CredentialLifecycleBadge({ state }: { state: CredentialLifecycleState }) {
  const styles: Record<CredentialLifecycleState, string> = {
    available: 'bg-green-100 text-green-800',
    expiring_soon: 'bg-yellow-100 text-yellow-800',
    expired: 'bg-orange-100 text-orange-800',
    deleted: 'bg-red-100 text-red-800',
    unavailable: 'bg-gray-200 text-gray-800',
  };
  const labels: Record<CredentialLifecycleState, string> = {
    available: 'Vigente',
    expiring_soon: 'Próxima a expirar',
    expired: 'Expirada',
    deleted: 'Eliminada',
    unavailable: 'No disponible',
  };

  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${styles[state]}`}>{labels[state]}</span>;
}

function AuditOutcomeBadge({ success }: { success: boolean }) {
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
      {success ? 'Éxito' : 'Fallo'}
    </span>
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
  const classes: Record<Order['status'], string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    in_progress: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  const labels: Record<Order['status'], string> = {
    pending: 'Pendiente',
    in_progress: 'En proceso',
    completed: 'Completada',
    cancelled: 'Cancelada',
  };

  return (
    <span
      className={`text-xs px-2 py-1 rounded-full ${classes[status]}`}
      aria-label={`Estado de orden: ${labels[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function PaymentBadge({ status }: { status: Order['payment_status'] }) {
  const classes: Record<Order['payment_status'], string> = {
    paid: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    failed: 'bg-red-100 text-red-800',
    refunded: 'bg-gray-200 text-gray-800',
  };

  const labels: Record<Order['payment_status'], string> = {
    paid: 'Pagado',
    pending: 'Pendiente',
    failed: 'Fallido',
    refunded: 'Reembolsado',
  };

  return (
    <span
      className={`text-xs px-2 py-1 rounded-full ${classes[status]}`}
      aria-label={`Estado de pago: ${labels[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function SupportStatusBadge({ status }: { status: SupportMessage['status'] }) {
  const classes: Record<SupportMessage['status'], string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    in_progress: 'bg-blue-100 text-blue-800',
    resolved: 'bg-green-100 text-green-800',
  };
  const labels: Record<SupportMessage['status'], string> = {
    pending: 'Pendiente',
    in_progress: 'En proceso',
    resolved: 'Resuelto',
  };

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${classes[status]}`}
      aria-label={`Estado de soporte: ${labels[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function getOrderTransitions(currentStatus: Order['status']): { value: Order['status']; label: string }[] {
  switch (currentStatus) {
    case 'pending':
      return [
        { value: 'in_progress', label: 'En proceso' },
        { value: 'cancelled', label: 'Cancelar' },
      ];
    case 'in_progress':
      return [
        { value: 'completed', label: 'Completar' },
        { value: 'cancelled', label: 'Cancelar' },
      ];
    case 'completed':
      return [
        { value: 'in_progress', label: 'Reabrir' },
      ];
    case 'cancelled':
      return [];
    default:
      return [];
  }
}

function SystemLine({ ok = false, label }: { ok?: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3">
      {ok ? <CheckCircle2 size={18} className="text-green-600" /> : <ShieldAlert size={18} className="text-yellow-600" />}
      <span>{label}</span>
    </div>
  );
}
