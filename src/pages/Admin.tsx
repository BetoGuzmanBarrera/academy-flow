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
} from 'lucide-react';
import type { QueryData } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AdminMfaGate } from '../components/AdminMfaGate';
import { AdminActivityHistory } from '../components/AdminActivityHistory';
import { AdminReferralMetrics } from '../components/AdminReferralMetrics';
import { ServiceDetails } from '../components/ServiceDetails';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  Input,
  Modal,
  SearchBar,
  Select,
  StatCard,
  Textarea,
} from '../components/ui';
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
  const tabButtons = useRef<Array<HTMLButtonElement | null>>([]);

  const loadData = useCallback(async () => {
    if (!isAdmin) return;

    setLoading(true);
    setError('');

    try {
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
    } catch (error) {
      console.error('No se pudo cargar el panel administrativo:', error);
      setError('No se pudo cargar el panel administrativo. Recarga el panel.');
    } finally {
      setLoading(false);
    }
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

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

    event.preventDefault();
    let nextIndex = index;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;

    setTab(tabs[nextIndex].id);
    tabButtons.current[nextIndex]?.focus();
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="mb-8 flex flex-col gap-5 rounded-af-lg border border-academy-border bg-gradient-to-br from-white to-blue-50/70 p-5 shadow-af-card sm:flex-row sm:items-start sm:justify-between sm:p-7">
        <div>
          <Badge variant="primary">ADMINISTRACIÓN</Badge>
          <h1 className="mt-4 text-af-h1 text-academy-text">Panel de Academy Flow</h1>
          <p className="mt-2 max-w-2xl text-academy-text-muted">
            Gestiona catálogo, órdenes, soporte y operaciones desde un solo lugar.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => void loadData()}
          loading={loading}
          leadingIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
          className="w-full sm:w-auto"
        >
          Actualizar
        </Button>
      </div>

      <div className="mb-8 overflow-x-auto border-b border-academy-border" role="tablist" aria-label="Secciones administrativas">
        <div className="flex min-w-max gap-1">
        {tabs.map(({ id, label, icon: Icon }, index) => (
          <button
            key={id}
            ref={(element) => { tabButtons.current[index] = element; }}
            id={`admin-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`admin-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            className={`flex min-h-touch items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-academy-primary ${
              tab === id
                ? 'border-academy-primary text-academy-primary'
                : 'border-transparent text-academy-text-muted hover:text-academy-text'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
        </div>
      </div>

      {error && (
        <Alert className="mb-6" variant="error" role="alert" title="No se pudo completar la operación">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <button type="button" className="font-semibold underline" onClick={() => setError('')}>Cerrar</button>
          </div>
        </Alert>
      )}

      {notice && (
        <Alert className="mb-6" variant="success" role="status">{notice}</Alert>
      )}

      <div
        id={`admin-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`admin-tab-${tab}`}
        tabIndex={0}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary"
      >
      {loading ? (
        <CenteredLoader />
      ) : (
        <>
          {tab === 'dashboard' && (
            <div className="space-y-8">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard icon={<CircleDollarSign className="h-5 w-5" />} label="Ingresos confirmados" value={`$${metrics.revenue.toFixed(2)}`} />
                <StatCard icon={<PackageCheck className="h-5 w-5" />} label="Órdenes" value={String(metrics.orders)} />
                <StatCard icon={<Loader2 className="h-5 w-5" />} label="Pendientes" value={String(metrics.pendingOrders)} />
                <StatCard icon={<Boxes className="h-5 w-5" />} label="Servicios activos" value={String(metrics.activeServices)} />
                <StatCard icon={<MessageSquare className="h-5 w-5" />} label="Soporte pendiente" value={String(metrics.pendingSupport)} />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <h2 className="text-af-h3 text-academy-text">Órdenes recientes</h2>
                    <p className="mt-1 text-af-body-sm text-academy-text-muted">Las cinco órdenes más recientes.</p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {orders.length === 0 && (
                      <EmptyState title="Sin órdenes recientes" description="Las órdenes aparecerán aquí cuando estén disponibles." />
                    )}
                    {orders.slice(0, 5).map((order) => (
                      <div key={order.id} className="flex items-center justify-between gap-4 border-b border-academy-border pb-3 last:border-0 last:pb-0">
                        <div>
                          <p className="font-mono text-sm">#{order.id.slice(0, 8)}</p>
                          <p className="text-xs text-academy-text-muted">{new Date(order.created_at).toLocaleString('es-MX')}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">${Number(order.total_amount).toFixed(2)}</p>
                          <StatusBadge status={order.status} />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <h2 className="text-af-h3 text-academy-text">Estado del sistema</h2>
                    <p className="mt-1 text-af-body-sm text-academy-text-muted">Controles configurados en la aplicación.</p>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <SystemLine ok label="RLS y roles administrativos configurados" />
                    <SystemLine ok label="Precios calculados dentro de PostgreSQL" />
                    <SystemLine ok label="Órdenes creadas como pendientes" />
                    <SystemLine ok label="Credenciales cifradas con AES-256-GCM" />
                    <SystemLine ok label="Pagos con Stripe habilitados" />
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {tab === 'services' && (
            <div className="space-y-8">
              <div>
                <h2 className="text-af-h2 text-academy-text">Catálogo y servicios</h2>
                <p className="mt-1 text-academy-text-muted">Administra categorías, disponibilidad y precios del catálogo.</p>
              </div>
              <div className="grid gap-6 lg:grid-cols-3">
                <Card>
                  <CardHeader>
                    <h3 className="text-af-h3 text-academy-text">Nueva categoría</h3>
                    <p className="mt-1 text-af-body-sm text-academy-text-muted">Organiza los servicios disponibles.</p>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleCreateCategory} className="space-y-4">
                      <Input
                        label="Nombre de la categoría"
                        value={newCategoryName}
                        onChange={(event) => setNewCategoryName(event.target.value)}
                        placeholder="Ej. Idiomas"
                      />
                      <Button
                        type="submit"
                        className="w-full"
                        variant="secondary"
                        loading={savingId === 'new-category'}
                        leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
                      >
                        Crear categoría
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                  <CardHeader>
                    <h3 className="text-af-h3 text-academy-text">Nuevo servicio</h3>
                    <p className="mt-1 text-af-body-sm text-academy-text-muted">Publica una oferta usando los datos reales del catálogo.</p>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleCreateService} className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Input
                          required
                          label="Nombre"
                          value={newService.name}
                          onChange={(event) => setNewService((current) => ({ ...current, name: event.target.value }))}
                        />
                        <Select
                          required
                          label="Categoría"
                          value={newService.categoryId}
                          onChange={(event) => setNewService((current) => ({ ...current, categoryId: event.target.value }))}
                        >
                          <option value="">Selecciona categoría</option>
                          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                        </Select>
                        <Input
                          required
                          label="Precio (MXN)"
                          type="number"
                          min="0"
                          step="0.01"
                          value={newService.price}
                          onChange={(event) => setNewService((current) => ({ ...current, price: event.target.value }))}
                        />
                        <Select
                          label="Disponibilidad"
                          value={newService.isActive ? 'active' : 'inactive'}
                          onChange={(event) => setNewService((current) => ({
                            ...current,
                            isActive: event.target.value === 'active',
                          }))}
                        >
                          <option value="active">Activo</option>
                          <option value="inactive">Inactivo</option>
                        </Select>
                        <div className="sm:col-span-2">
                          <Textarea
                            label="Descripción"
                            value={newService.description}
                            onChange={(event) => setNewService((current) => ({ ...current, description: event.target.value }))}
                          />
                        </div>
                      </div>
                      <Button
                        type="submit"
                        loading={savingId === 'new-service'}
                        leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
                      >
                        {savingId === 'new-service' ? 'Creando…' : 'Crear servicio'}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </div>

              <div className="overflow-x-auto rounded-af-lg border border-academy-border bg-academy-surface shadow-af-card">
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
                          <Badge variant={service.is_active ? 'success' : 'neutral'}>
                            {getAdminServiceStatusLabel(service.is_active)}
                          </Badge>
                        </td>
                        <td className="p-4">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleEditService(service)}
                            disabled={savingId !== null}
                            leadingIcon={<Pencil className="h-4 w-4" aria-hidden="true" />}
                          >
                            Editar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'orders' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-af-h2 text-academy-text">Órdenes</h2>
                <p className="mt-1 text-academy-text-muted">Consulta pagos, servicios y transiciones operativas seguras.</p>
              </div>
              <Card>
                <CardContent>
                <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(160px,1fr)_minmax(160px,1fr)_auto]">
                  <div>
                    <label htmlFor="admin-order-search" className="mb-1.5 block text-af-label text-academy-text">Buscar órdenes</label>
                    <SearchBar
                      id="admin-order-search"
                      value={orderFilters.search}
                      onChange={(event) => setOrderFilters((current) => ({
                        ...current,
                        search: event.target.value,
                      }))}
                      onClear={() => setOrderFilters((current) => ({ ...current, search: '' }))}
                      placeholder="Buscar por orden o servicio"
                    />
                  </div>

                  <Select
                    label="Estado de orden"
                      value={orderFilters.status}
                      onChange={(event) => setOrderFilters((current) => ({
                        ...current,
                        status: event.target.value as AdminOrderStatusFilter,
                      }))}
                    >
                      <option value="all">Todos</option>
                      <option value="pending">Pendientes</option>
                      <option value="in_progress">En proceso</option>
                      <option value="completed">Completadas</option>
                      <option value="cancelled">Canceladas</option>
                  </Select>

                  <Select
                    label="Estado de pago"
                      value={orderFilters.paymentStatus}
                      onChange={(event) => setOrderFilters((current) => ({
                        ...current,
                        paymentStatus: event.target.value as AdminPaymentStatusFilter,
                      }))}
                    >
                      <option value="all">Todos</option>
                      <option value="paid">Pagado</option>
                      <option value="pending">Pendiente</option>
                      <option value="failed">Fallido</option>
                      <option value="refunded">Reembolsado</option>
                  </Select>

                  {orderFiltersActive && (
                    <Button
                      variant="secondary"
                      onClick={() => setOrderFilters(emptyAdminOrderFilters)}
                      className="self-end"
                    >
                      Limpiar filtros
                    </Button>
                  )}
                </div>

                <p className="mt-3 text-af-body-sm text-academy-text-muted" aria-live="polite">
                  Mostrando {filteredOrders.length} de {orders.length} órdenes
                </p>
                </CardContent>
              </Card>

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
                                className="min-h-touch rounded-af-md border border-academy-border bg-academy-surface px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary"
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
                    <Badge variant="warning">Acceso sensible</Badge>
                    <h2 className="mt-3 text-af-h2 text-academy-text">Credenciales cifradas</h2>
                    <p className="mt-1 text-af-body-sm text-academy-text-muted">
                      El contenido solo se obtiene tras una confirmación explícita y cada intento queda auditado.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => void loadCredentials()}
                    loading={credentialsLoading || credentialAuditLoading}
                    leadingIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
                  >
                    {(credentialsLoading || credentialAuditLoading) ? 'Cargando…' : 'Cargar / actualizar'}
                  </Button>
                </div>

                {revealError && <Alert variant="error" role="alert">{revealError}</Alert>}

                {revealedCredential && (() => {
                  const { methodLabel, fields } = getCredentialFields(revealedCredential.decrypted);
                  return (
                    <Alert variant="info" role="status" className="block">
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
                          className="flex min-h-touch min-w-touch items-center justify-center rounded-af-md hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary"
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
                    </Alert>
                  );
                })()}

                <Card>
                  <CardContent>
                  <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(190px,1fr)_auto]">
                    <div>
                      <label htmlFor="admin-credential-search" className="mb-1.5 block text-af-label text-academy-text">Buscar credenciales</label>
                      <SearchBar
                        id="admin-credential-search"
                        value={credentialFilters.search}
                        onChange={(event) => setCredentialFilters((current) => ({ ...current, search: event.target.value }))}
                        onClear={() => setCredentialFilters((current) => ({ ...current, search: '' }))}
                        placeholder="Orden, servicio o credencial"
                      />
                    </div>
                    <Select
                      label="Estado"
                        value={credentialFilters.state}
                        onChange={(event) => setCredentialFilters((current) => ({
                          ...current,
                          state: event.target.value as AdminCredentialFilters['state'],
                        }))}
                      >
                        <option value="all">Todos</option>
                        <option value="available">Vigentes</option>
                        <option value="expiring_soon">Próximas a expirar</option>
                        <option value="expired">Expiradas</option>
                        <option value="deleted">Eliminadas</option>
                        <option value="unavailable">No disponibles</option>
                    </Select>
                    <Button
                      variant="secondary"
                      onClick={() => setCredentialFilters(emptyAdminCredentialFilters)}
                      className="self-end"
                    >
                      Limpiar
                    </Button>
                  </div>
                  <p className="mt-3 text-af-body-sm text-academy-text-muted" aria-live="polite">
                    {filteredCredentials.length} de {credentialRows.length} credenciales
                  </p>
                  </CardContent>
                </Card>

                {credentialsLoading ? (
                  <CenteredLoader />
                ) : credentialRows.length === 0 ? (
                  <EmptyState icon={<KeyRound className="h-8 w-8" />} title="Inventario pendiente de cargar" description="No hay credenciales registradas. Usa “Cargar / actualizar” para consultar el inventario seguro." />
                ) : filteredCredentials.length === 0 ? (
                  <EmptyState icon={<KeyRound className="h-8 w-8" />} title="Sin coincidencias" description="No hay credenciales que coincidan con los filtros." />
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
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setRevealError('');
                                    setPendingRevealCredential(credential);
                                  }}
                                  disabled={!revealable || revealLoadingId !== null}
                                  loading={revealLoadingId === credential.credentialId}
                                  leadingIcon={<Eye className="h-4 w-4" aria-hidden="true" />}
                                >
                                  Revelar
                                </Button>
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

                {credentialAuditError && <Alert variant="error" role="alert">{credentialAuditError}</Alert>}

                <Card>
                  <CardContent>
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(180px,1fr)_minmax(180px,1fr)_auto]">
                    <div>
                      <label htmlFor="admin-credential-audit-search" className="mb-1.5 block text-af-label text-academy-text">Buscar auditoría</label>
                      <SearchBar
                        id="admin-credential-audit-search"
                        value={credentialAuditFilters.search}
                        onChange={(event) => setCredentialAuditFilters((current) => ({ ...current, search: event.target.value }))}
                        onClear={() => setCredentialAuditFilters((current) => ({ ...current, search: '' }))}
                        placeholder="Orden, credencial, request o motivo"
                      />
                    </div>
                    <Select
                      label="Acción"
                        value={credentialAuditFilters.action}
                        onChange={(event) => setCredentialAuditFilters((current) => ({ ...current, action: event.target.value }))}
                      >
                        <option value="all">Todas</option>
                        {credentialAuditActions.map((action) => <option key={action} value={action}>{action}</option>)}
                    </Select>
                    <Select
                      label="Resultado"
                        value={credentialAuditFilters.outcome}
                        onChange={(event) => setCredentialAuditFilters((current) => ({
                          ...current,
                          outcome: event.target.value as AdminCredentialAuditFilters['outcome'],
                        }))}
                      >
                        <option value="all">Todos</option>
                        <option value="success">Éxito</option>
                        <option value="failure">Fallo</option>
                    </Select>
                    <Button
                      variant="secondary"
                      onClick={() => setCredentialAuditFilters(emptyAdminCredentialAuditFilters)}
                      className="self-end"
                    >
                      Limpiar
                    </Button>
                  </div>
                  <p className="mt-3 text-af-body-sm text-academy-text-muted" aria-live="polite">
                    {filteredCredentialAuditLogs.length} de {credentialAuditLogs.length} registros cargados
                  </p>
                  </CardContent>
                </Card>

                {credentialAuditLoading ? (
                  <CenteredLoader />
                ) : credentialAuditLogs.length === 0 ? (
                  <EmptyState icon={<History className="h-8 w-8" />} title="Sin registros de auditoría" description="No hay registros de auditoría para mostrar." />
                ) : filteredCredentialAuditLogs.length === 0 ? (
                  <EmptyState icon={<History className="h-8 w-8" />} title="Sin coincidencias" description="No hay registros que coincidan con los filtros." />
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
            <div className="space-y-5">
              <div>
                <h2 className="text-af-h2 text-academy-text">Soporte</h2>
                <p className="mt-1 text-academy-text-muted">Consulta mensajes, responde y actualiza su estado operativo.</p>
              </div>
              <Card>
                <CardContent>
                <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(180px,1fr)_auto]">
                  <div>
                    <label htmlFor="admin-support-search" className="mb-1.5 block text-af-label text-academy-text">Buscar mensajes</label>
                    <SearchBar
                      id="admin-support-search"
                      value={supportFilters.search}
                      onChange={(event) => setSupportFilters((current) => ({
                        ...current,
                        search: event.target.value,
                      }))}
                      onClear={() => setSupportFilters((current) => ({ ...current, search: '' }))}
                      placeholder="Mensaje, usuario, nombre o correo"
                    />
                  </div>

                  <Select
                    label="Estado"
                      value={supportFilters.status}
                      onChange={(event) => setSupportFilters((current) => ({
                        ...current,
                        status: event.target.value as AdminSupportStatusFilter,
                      }))}
                    >
                      <option value="all">Todos</option>
                      <option value="pending">Pendientes</option>
                      <option value="in_progress">En proceso</option>
                      <option value="resolved">Resueltos</option>
                  </Select>

                  {supportFiltersActive && (
                    <Button
                      variant="secondary"
                      onClick={() => setSupportFilters(emptyAdminSupportFilters)}
                      className="self-end"
                    >
                      Limpiar filtros
                    </Button>
                  )}
                </div>

                <p className="mt-3 text-af-body-sm text-academy-text-muted" aria-live="polite">
                  Mostrando {filteredMessages.length} de {messages.length} mensajes
                </p>
                </CardContent>
              </Card>

              {filteredMessages.length === 0 ? (
                <EmptyState
                  icon={<MessageSquare className="h-8 w-8" />}
                  title={messages.length === 0 ? 'Sin mensajes de soporte' : 'Sin coincidencias'}
                  description={messages.length === 0
                    ? 'No hay mensajes de soporte.'
                    : 'No se encontraron mensajes con estos filtros.'}
                />
              ) : filteredMessages.map((message) => (
                <Card key={message.id}>
                  <article className="p-5 sm:p-6">
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
                        className="min-h-touch rounded-af-md border border-academy-border bg-academy-surface px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary disabled:opacity-50"
                      >
                        <option value="pending">Pendiente</option>
                        <option value="in_progress">En proceso</option>
                        <option value="resolved">Resuelto</option>
                      </select>
                    </div>
                  </div>
                  <p className="mb-4 whitespace-pre-wrap rounded-af-md bg-blue-50 p-4 text-academy-text">{message.message}</p>
                  <Textarea
                    label={`Respuesta para ${message.user_name}`}
                    value={responseDrafts[message.id] ?? ''}
                    onChange={(event) => setResponseDrafts((current) => ({ ...current, [message.id]: event.target.value }))}
                    placeholder="Respuesta del administrador"
                  />
                  <Button
                    className="mt-3"
                    onClick={() => void handleSupportResponse(message)}
                    loading={savingId === message.id}
                    leadingIcon={<Save className="h-4 w-4" aria-hidden="true" />}
                  >
                    Guardar respuesta y resolver
                  </Button>
                  </article>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
      </div>

      {pendingRevealCredential && (
        <Modal
          open
          title="Confirmar revelado de credencial"
          onClose={() => setPendingRevealCredential(null)}
          dismissible={revealLoadingId === null}
          footer={(
            <>
              <Button
                variant="secondary"
                onClick={() => setPendingRevealCredential(null)}
                disabled={revealLoadingId !== null}
              >
                Volver
              </Button>
              <Button
                onClick={() => void handleRevealCredential(pendingRevealCredential)}
                loading={revealLoadingId === pendingRevealCredential.credentialId}
                disabled={revealLoadingId !== null}
                leadingIcon={<Eye className="h-4 w-4" aria-hidden="true" />}
              >
                {revealLoadingId === pendingRevealCredential.credentialId ? 'Revelando…' : 'Revelar credencial'}
              </Button>
            </>
          )}
        >
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm text-academy-text-muted">
                Esta acción descifrará temporalmente la credencial y quedará registrada en la auditoría.
              </p>
              <div className="mt-4 rounded-af-md bg-academy-subtle p-3 text-sm text-academy-text">
                <p><span className="font-semibold">Orden:</span> #{shortId(pendingRevealCredential.orderId)}</p>
                <p className="mt-1"><span className="font-semibold">Servicio:</span> {pendingRevealCredential.serviceName}</p>
              </div>
            </div>
          </div>
          {revealError && <Alert className="mt-4" variant="error" role="alert">{revealError}</Alert>}
        </Modal>
      )}

      {editingService && (
        <Modal
          open
          title="Editar servicio"
          className="max-w-xl"
          dismissible={savingId !== editingService.id}
          onClose={() => {
            setEditingService(null);
            setError('');
          }}
          footer={(
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setEditingService(null);
                  setError('');
                }}
                disabled={savingId === editingService.id}
              >
                Cancelar
              </Button>
              <Button
                onClick={() => void handleSaveService()}
                loading={savingId === editingService.id}
                leadingIcon={<Save className="h-4 w-4" aria-hidden="true" />}
              >
                {savingId === editingService.id ? 'Guardando…' : 'Guardar'}
              </Button>
            </>
          )}
        >
          <p className="mb-5 text-sm text-academy-text-muted">
            Actualiza sus datos o desactívalo para ocultarlo a nuevos clientes.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input
                label="Nombre"
                  required
                  value={editingService.draft.name}
                  onChange={(event) => setEditingService((current) => current ? {
                    ...current,
                    draft: { ...current.draft, name: event.target.value },
                  } : current)}
              />
            </div>
            <Select
              label="Categoría"
                  required
                  value={editingService.draft.categoryId}
                  onChange={(event) => setEditingService((current) => current ? {
                    ...current,
                    draft: { ...current.draft, categoryId: event.target.value },
                  } : current)}
                >
                  <option value="">Selecciona categoría</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
            </Select>
            <Input
              label="Precio (MXN)"
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={editingService.draft.price}
                  onChange={(event) => setEditingService((current) => current ? {
                    ...current,
                    draft: { ...current.draft, price: event.target.value },
                  } : current)}
            />
            <div className="sm:col-span-2">
              <Textarea
                label="Descripción"
                  value={editingService.draft.description}
                  onChange={(event) => setEditingService((current) => current ? {
                    ...current,
                    draft: { ...current.draft, description: event.target.value },
                  } : current)}
                  rows={3}
              />
            </div>
            <div className="sm:col-span-2">
              <Select
                label="Disponibilidad"
                  value={editingService.draft.isActive ? 'active' : 'inactive'}
                  onChange={(event) => setEditingService((current) => current ? {
                    ...current,
                    draft: { ...current.draft, isActive: event.target.value === 'active' },
                  } : current)}
                  helperText="Los servicios inactivos conservan su historial y no están disponibles para nuevas compras."
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
              </Select>
            </div>
          </div>
          {error && <Alert className="mt-4" variant="error" role="alert">{error}</Alert>}
        </Modal>
      )}

      {pendingCancellationOrder && (
        <Modal
          open
          title={`¿Cancelar la orden #${pendingCancellationOrder.id.slice(0, 8)}?`}
          onClose={() => setPendingCancellationOrder(null)}
          dismissible={!cancellationLoading}
          footer={(
            <>
              <Button
                variant="secondary"
                onClick={() => setPendingCancellationOrder(null)}
                disabled={cancellationLoading}
              >
                Volver
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleConfirmOrderCancellation()}
                loading={cancellationLoading}
                leadingIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
              >
                {cancellationLoading ? 'Cancelando…' : 'Cancelar orden'}
              </Button>
            </>
          )}
        >
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
              <ShieldAlert className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-academy-text">
                Cancelar esta orden eliminará de forma irreversible las credenciales asociadas.
              </p>
              <p className="mt-2 font-semibold text-academy-danger">Esta acción no se puede deshacer.</p>
              <div className="mt-4 rounded-af-md bg-academy-subtle p-3 text-sm text-academy-text">
                <span className="font-semibold">Servicios:</span>{' '}
                {getOrderServiceSummary(pendingCancellationOrder)}
              </div>
            </div>
          </div>
          {cancellationError && <Alert className="mt-4" variant="error" role="alert">{cancellationError}</Alert>}
        </Modal>
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
    <div className="flex min-h-64 items-center justify-center" role="status" aria-label="Cargando panel administrativo">
      <Loader2 className="h-10 w-10 animate-spin text-academy-primary" aria-hidden="true" />
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

function AuditOutcomeBadge({ success }: { success: boolean }) {
  return <Badge variant={success ? 'success' : 'danger'}>{success ? 'Éxito' : 'Fallo'}</Badge>;
}

function StatusBadge({ status }: { status: Order['status'] }) {
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

function PaymentBadge({ status }: { status: Order['payment_status'] }) {
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

function SupportStatusBadge({ status }: { status: SupportMessage['status'] }) {
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
      {ok ? <CheckCircle2 size={18} className="text-green-600" aria-hidden="true" /> : <ShieldAlert size={18} className="text-yellow-600" aria-hidden="true" />}
      <span>{label}</span>
    </div>
  );
}
