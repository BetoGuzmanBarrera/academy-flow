import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle,
  CreditCard,
  Loader2,
  LockKeyhole,
  Tag,
  X,
} from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { CredentialsForm, type CredentialData } from '../components/CredentialsForm';
import { PersonalizedHelp } from '../components/PersonalizedHelp';
import { openSupportChat } from '../components/SupportChat';
import { ServiceDetails } from '../components/ServiceDetails';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  Radio,
} from '../components/ui';
import { hasValidDetails } from '../lib/serviceCustomization';
import { STRIPE_MINIMUM_MXN } from '../lib/stripeConstants';
import type { Category } from '../lib/database.types';

interface CheckoutProps {
  onBack: () => void;
  onComplete: () => void;
}

const GENERIC_ORDER_ERROR =
  'No pudimos registrar tu orden en este momento. Revisa tu carrito e inténtalo de nuevo.';

function friendlyOrderError(err: unknown): string {
  if (err instanceof Error && err.message.startsWith('[')) {
    return err.message;
  }

  if (err && typeof err === 'object' && 'code' in err) {
    const { code, message } = err as { code?: string; message?: string };
    if (code === 'P0001' && message) return message;
  }

  return GENERIC_ORDER_ERROR;
}

function StepIndicator({ step }: { step: 'credentials' | 'payment' }) {
  const paymentStep = step === 'payment';

  return (
    <nav aria-label="Progreso del checkout">
      <ol className="grid grid-cols-2 gap-3">
        <li
          aria-current={!paymentStep ? 'step' : undefined}
          className={`flex min-h-touch items-center gap-3 rounded-af-md border px-3 py-2 ${
            paymentStep
              ? 'border-green-200 bg-green-50 text-green-900'
              : 'border-blue-200 bg-blue-50 text-academy-primary'
          }`}
        >
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${paymentStep ? 'bg-green-600' : 'bg-academy-primary'}`}>
            {paymentStep ? <Check className="h-4 w-4" aria-hidden="true" /> : '1'}
          </span>
          <span className="text-af-label">Información</span>
        </li>
        <li
          aria-current={paymentStep ? 'step' : undefined}
          className={`flex min-h-touch items-center gap-3 rounded-af-md border px-3 py-2 ${
            paymentStep
              ? 'border-blue-200 bg-blue-50 text-academy-primary'
              : 'border-academy-border bg-academy-surface text-academy-text-muted'
          }`}
        >
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${paymentStep ? 'bg-academy-primary' : 'bg-slate-400'}`}>
            2
          </span>
          <span className="text-af-label">Confirmación</span>
        </li>
      </ol>
    </nav>
  );
}

export function Checkout({ onBack, onComplete }: CheckoutProps) {
  const { items, totalAmount, clearCart } = useCart();
  const { user } = useAuth();
  const [step, setStep] = useState<'credentials' | 'payment'>('credentials');
  const [categories, setCategories] = useState<Record<string, Category>>({});
  const [credentials, setCredentials] = useState<Record<string, CredentialData>>({});
  const [referralCode, setReferralCode] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [referralError, setReferralError] = useState('');
  const [referralSuccess, setReferralSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [successOrderId, setSuccessOrderId] = useState<string | null>(null);
  const [paymentRedirectError, setPaymentRedirectError] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const submitLockRef = useRef(false);

  useEffect(() => {
    let active = true;

    const loadCategories = async () => {
      const categoryIds = [
        ...new Set(
          items
            .map((item) => item.service.category_id)
            .filter((id): id is string => id !== null),
        ),
      ];

      if (categoryIds.length === 0) {
        if (active) setCategories({});
        return;
      }

      const { data } = await supabase
        .from('categories')
        .select('*')
        .in('id', categoryIds);

      if (active && data) {
        const categoriesMap: Record<string, Category> = {};
        data.forEach((category) => {
          categoriesMap[category.id] = category;
        });
        setCategories(categoriesMap);
      }
    };

    void loadCategories();
    return () => {
      active = false;
    };
  }, [items]);

  const handleCredentialsSubmit = (serviceId: string, creds: CredentialData) => {
    setCredentials((previous) => ({
      ...previous,
      [serviceId]: creds,
    }));
  };

  const allCredentialsProvided = () => items.every((item) => credentials[item.service_id]);
  const allDetailsValid = items.every((item) =>
    hasValidDetails(
      item.service.name,
      categories[item.service.category_id ?? '']?.name ?? '',
      item.details,
    ),
  );

  const handleApplyReferralCode = async () => {
    if (!referralCode.trim()) {
      setReferralError('Por favor ingresa un código de referido');
      return;
    }

    setReferralError('');
    const { data, error } = await supabase
      .rpc('validate_referral_code', { code_param: referralCode.toUpperCase() })
      .single();

    if (error?.message.includes('Referral code validation rate limit exceeded')) {
      setReferralError('Demasiados intentos. Espera unos minutos antes de probar otro código.');
      return;
    }

    if (error || !data?.valid) {
      setReferralError('Código de referido inválido');
      return;
    }

    if (data.self_use) {
      setReferralError('No puedes usar tu propio código de referido');
      return;
    }

    const discount = totalAmount * 0.3;
    setDiscountAmount(discount);
    setReferralSuccess(true);
    setReferralError('');
  };

  const handleRemoveReferralCode = () => {
    setReferralCode('');
    setDiscountAmount(0);
    setReferralSuccess(false);
    setReferralError('');
  };

  const finalAmount = totalAmount - discountAmount;
  const belowStripeMinimum = finalAmount < STRIPE_MINIMUM_MXN;
  const missingAmount = Math.max(0, STRIPE_MINIMUM_MXN - finalAmount);

  const startStripeCheckout = async (orderId: string, accessToken: string): Promise<void> => {
    setRedirecting(true);
    try {
      const checkoutResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ orderId }),
      });

      const checkoutResult = await checkoutResponse.json();

      if (!checkoutResponse.ok || !checkoutResult?.sessionUrl) {
        setPaymentRedirectError(true);
        setSuccessOrderId(orderId);
        setSuccess(true);
        return;
      }

      window.location.href = checkoutResult.sessionUrl;
    } catch {
      setPaymentRedirectError(true);
      setSuccessOrderId(orderId);
      setSuccess(true);
    } finally {
      setRedirecting(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (submitLockRef.current) return;
    submitLockRef.current = true;

    setError('');
    setLoading(true);

    try {
      if (!user) {
        setError('Debes iniciar sesión para completar la compra');
        return;
      }

      if (belowStripeMinimum) {
        setError(`Faltan $${missingAmount.toFixed(2)} MXN para alcanzar el pago mínimo con tarjeta.`);
        return;
      }

      const credentialsPayload = items.map((item) => {
        const credential = credentials[item.service_id];

        return {
          service_id: item.service_id,
          platform: credential?.platform || '',
          accessMethod: credential?.accessMethod || null,
          username: credential?.username || '',
          email: credential?.email || '',
          password: credential?.password || '',
          additionalInfo: credential?.additionalInfo || '',
        };
      });

      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) {
        setError('Debes iniciar sesión para completar la compra');
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-secure-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          paymentMethod: 'card',
          referralCode: referralSuccess ? referralCode.toUpperCase() : null,
          credentials: credentialsPayload,
          billing: null,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (result?.diagnostic) {
          throw new Error(`[${result.stage}] code=${result.code ?? 'null'} — ${result.message}`);
        }
        throw new Error(result?.error || GENERIC_ORDER_ERROR);
      }

      const orderId = result?.orderId;
      await clearCart();
      setSuccessOrderId(orderId ?? null);

      if (orderId) {
        await startStripeCheckout(orderId, accessToken);
      } else {
        setSuccess(true);
      }
    } catch (submissionError) {
      console.error('No se pudo crear la orden:', submissionError);
      setError(friendlyOrderError(submissionError));
    } finally {
      setLoading(false);
      submitLockRef.current = false;
    }
  };

  if (redirecting) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center px-4 py-12 sm:px-6">
        <Card className="w-full">
          <CardContent className="p-8 text-center" role="status" aria-live="polite" aria-busy="true">
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-academy-primary motion-reduce:animate-none" aria-hidden="true" />
            <h1 className="mt-5 text-af-h2 text-academy-text">Redirigiendo a Stripe…</h1>
            <p className="mt-3 text-academy-text-muted">
              Te llevaremos a Stripe para completar el pago de forma segura.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center px-4 py-12 sm:px-6">
        <Card className="w-full">
          <CardContent className="p-8 text-center">
            {paymentRedirectError ? (
              <>
                <AlertCircle className="mx-auto h-14 w-14 text-amber-600" aria-hidden="true" />
                <h1 className="mt-5 text-af-h2 text-academy-text">
                  La orden fue creada, pero no pudimos iniciar el pago.
                </h1>
                <p className="mt-3 text-academy-text-muted">
                  Tu orden quedó registrada como pendiente. Puedes intentar el pago desde Mis Órdenes.
                </p>
                <Button className="mt-7" onClick={onComplete}>Ir a Mis Órdenes</Button>
              </>
            ) : (
              <>
                <CheckCircle className="mx-auto h-14 w-14 text-green-600" aria-hidden="true" />
                <h1 className="mt-5 text-af-h2 text-academy-text">¡Orden registrada!</h1>
                <p className="mt-3 text-academy-text-muted">
                  La orden quedó registrada como pendiente de pago.
                </p>
              </>
            )}
            {successOrderId && (
              <p className="mt-5 font-mono text-af-body-sm text-academy-text-muted">
                Orden #{successOrderId.slice(0, 8)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-full overflow-x-hidden bg-academy-background">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <Button
          variant="ghost"
          leadingIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
          onClick={step === 'credentials' ? onBack : () => setStep('credentials')}
        >
          {step === 'credentials' ? 'Volver al carrito' : 'Volver a información de acceso'}
        </Button>

        <header className="mt-6">
          <Badge variant="primary">CHECKOUT</Badge>
          <h1 className="mt-4 text-4xl font-bold text-academy-text sm:text-af-h1">Finaliza tu pedido</h1>
          <p className="mt-3 max-w-2xl text-af-body-lg text-academy-text-muted">
            Revisa la información solicitada y confirma tu orden antes de continuar a Stripe.
          </p>
        </header>

        <div className="mt-8">
          <StepIndicator step={step} />
        </div>

        {step === 'credentials' ? (
          <section className="mt-8" aria-labelledby="credentials-heading">
            <div>
              <h2 id="credentials-heading" className="text-af-h2 text-academy-text">Información de acceso</h2>
              <p className="mt-2 text-academy-text-muted">
                Proporciona la información de acceso requerida para cada servicio.
              </p>
            </div>

            <div className="mt-6 space-y-5">
              {items.map((item) => {
                const category = categories[item.service.category_id ?? ''];
                if (!category) {
                  return (
                    <Alert key={item.id} variant="warning" role="status" title={item.service.name}>
                      No pudimos cargar la categoría necesaria para completar estos datos.
                    </Alert>
                  );
                }

                return (
                  <CredentialsForm
                    key={item.id}
                    service={item.service}
                    category={category}
                    onSubmit={(credentialData) => handleCredentialsSubmit(item.service_id, credentialData)}
                  />
                );
              })}
            </div>

            {!allDetailsValid && (
              <Alert className="mt-6" variant="warning" role="status">
                Completa los datos de personalización para todos los servicios antes de continuar.
              </Alert>
            )}

            <div className="mt-6 flex justify-end">
              <Button
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => setStep('payment')}
                disabled={!allCredentialsProvided() || !allDetailsValid}
              >
                Continuar a confirmación
              </Button>
            </div>
          </section>
        ) : (
          <section className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] lg:items-start" aria-label="Confirmación del pedido">
            <Card>
              <CardHeader>
                <h2 className="text-af-h3 text-academy-text">Resumen del pedido</h2>
              </CardHeader>
              <CardContent className="space-y-5">
                {items.map((item) => (
                  <div key={item.id} className="border-b border-academy-border pb-5 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-academy-text">{item.service.name}</h3>
                        <div className="mt-2">
                          <ServiceDetails
                            serviceName={item.service.name}
                            categoryName={categories[item.service.category_id ?? '']?.name ?? ''}
                            details={item.details}
                          />
                        </div>
                        <p className="mt-2 text-af-body-sm text-academy-text-muted">
                          ${item.service.price.toFixed(2)} × {item.quantity}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold text-academy-primary">
                        ${(item.service.price * item.quantity).toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}

                <div className="space-y-3 border-t border-academy-border pt-5">
                  <div className="flex justify-between gap-4 text-academy-text-muted">
                    <span>Subtotal</span>
                    <span className="font-semibold text-academy-text">${totalAmount.toFixed(2)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between gap-4 text-green-700">
                      <span>Descuento (30%)</span>
                      <span className="font-semibold">-${discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex items-end justify-between gap-4 border-t border-academy-border pt-4">
                    <span className="font-semibold text-academy-text">Total</span>
                    <span className="text-af-h2 text-academy-primary">${finalAmount.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <form onSubmit={handleSubmit} className="space-y-5" aria-busy={loading || undefined}>
              <Card>
                <CardHeader>
                  <h2 className="text-af-h3 text-academy-text">Referido</h2>
                </CardHeader>
                <CardContent>
                  {!referralSuccess ? (
                    <div className="space-y-3">
                      <Input
                        id="referral-code"
                        label="¿Tienes un código de referido?"
                        value={referralCode}
                        onChange={(event) => {
                          setReferralCode(event.target.value.toUpperCase());
                          setReferralError('');
                        }}
                        placeholder="CÓDIGO"
                        maxLength={8}
                        leadingIcon={<Tag className="h-4 w-4" />}
                        error={referralError || undefined}
                      />
                      <Button type="button" variant="secondary" className="w-full" onClick={handleApplyReferralCode}>
                        Aplicar código
                      </Button>
                    </div>
                  ) : (
                    <Alert variant="success" role="status" title="Código aplicado">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span><strong>{referralCode}</strong> · 30% de descuento aplicado</span>
                        <button
                          type="button"
                          onClick={handleRemoveReferralCode}
                          aria-label={`Quitar código de referido ${referralCode}`}
                          className="flex min-h-touch min-w-touch items-center justify-center rounded-af-md hover:bg-green-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <h2 className="text-af-h3 text-academy-text">Método de pago</h2>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Radio
                    name="payment"
                    value="card"
                    checked
                    readOnly
                    label="Tarjeta de débito/crédito"
                    description="Serás redirigido a Stripe para completar el pago."
                  />
                  <div className="flex items-start gap-3 rounded-af-md bg-blue-50 p-4 text-blue-950">
                    <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <p className="text-af-body-sm">
                      <strong>Pago procesado de forma segura con Stripe</strong>
                    </p>
                  </div>
                </CardContent>
              </Card>

              {error && <Alert variant="error" role="alert">{error}</Alert>}

              {belowStripeMinimum && (
                <Alert variant="warning" role="status" title="Pago mínimo con tarjeta">
                  Faltan ${missingAmount.toFixed(2)} MXN para alcanzar el pago mínimo con tarjeta.
                </Alert>
              )}

              <Button
                type="submit"
                size="lg"
                className="w-full"
                loading={loading}
                disabled={belowStripeMinimum}
                leadingIcon={<CreditCard className="h-5 w-5" aria-hidden="true" />}
              >
                {loading ? 'Procesando…' : 'Continuar a pago seguro'}
              </Button>
            </form>
          </section>
        )}

        <div className="mt-10">
          <PersonalizedHelp onOpenInternalSupport={() => openSupportChat()} />
        </div>
      </div>
    </div>
  );
}
