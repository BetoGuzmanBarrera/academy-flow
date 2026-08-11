import { useState, useEffect, useRef } from 'react';
import { CreditCard, ArrowLeft, CheckCircle, Tag, X, AlertCircle, Loader2 } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { CredentialsForm, CredentialData } from '../components/CredentialsForm';
import { ServiceDetails } from '../components/ServiceDetails';
import { hasValidDetails } from '../lib/serviceCustomization';
import type { Category } from '../lib/database.types';

interface CheckoutProps {
  onBack: () => void;
  onComplete: () => void;
}

const GENERIC_ORDER_ERROR =
  'No pudimos registrar tu orden en este momento. Revisa tu carrito e inténtalo de nuevo.';

// Solo mostramos los mensajes de validación que la propia función de checkout
// genera (SQLSTATE P0001). Cualquier otro error interno se registra en la
// consola y el cliente ve un mensaje genérico.
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

export function Checkout({ onBack, onComplete }: CheckoutProps) {
  const { items, totalAmount, clearCart } = useCart();
  const { user } = useAuth();
  const [step, setStep] = useState<'credentials' | 'payment'>('credentials');
  const [categories, setCategories] = useState<Record<string, Category>>({});
  const [credentials, setCredentials] = useState<Record<string, CredentialData>>({});
  const [paymentMethod] = useState<'card' | 'paypal'>('card');
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
  const [wantsBilling, setWantsBilling] = useState(false);
  const [billingRfc, setBillingRfc] = useState('');
  const [billingLegalName, setBillingLegalName] = useState('');
  const [billingPostalCode, setBillingPostalCode] = useState('');
  const [billingTaxRegime, setBillingTaxRegime] = useState('');
  const [billingCfdiUse, setBillingCfdiUse] = useState('G03');

  useEffect(() => {
    const loadCategories = async () => {
      const categoryIds = [...new Set(items.map((item) => item.service.category_id))];

      if (categoryIds.length === 0) {
        setCategories({});
        return;
      }

      const { data } = await supabase
        .from('categories')
        .select('*')
        .in('id', categoryIds);

      if (data) {
        const categoriesMap: Record<string, Category> = {};
        data.forEach((category) => {
          categoriesMap[category.id] = category;
        });
        setCategories(categoriesMap);
      }
    };

    void loadCategories();
  }, [items]);

  const handleCredentialsSubmit = (serviceId: string, creds: CredentialData) => {
    setCredentials(prev => ({
      ...prev,
      [serviceId]: creds
    }));
  };

  const allCredentialsProvided = () => {
    return items.every(item => credentials[item.service_id]);
  };

  const handleApplyReferralCode = async () => {
    if (!referralCode.trim()) {
      setReferralError('Por favor ingresa un código de referido');
      return;
    }

    setReferralError('');
    const { data, error } = await supabase
      .rpc('validate_referral_code', { code_param: referralCode.toUpperCase() })
      .single();

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

  const validateBillingFields = () => {
    if (wantsBilling) {
      if (!billingRfc || billingRfc.length < 12) {
        setError('RFC inválido');
        return false;
      }
      if (!billingLegalName.trim()) {
        setError('Ingresa el nombre o razón social');
        return false;
      }
      if (!billingPostalCode || billingPostalCode.length !== 5) {
        setError('Código postal inválido');
        return false;
      }
      if (!billingTaxRegime) {
        setError('Selecciona un régimen fiscal');
        return false;
      }
    }
    return true;
  };

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (submitLockRef.current) return;
    submitLockRef.current = true;

    setError('');
    setLoading(true);

    try {
      if (!user) {
        setError('Debes iniciar sesión para completar la compra');
        return;
      }

      if (!validateBillingFields()) {
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

      const billingPayload = wantsBilling
        ? {
            rfc: billingRfc.toUpperCase(),
            legal_name: billingLegalName.trim().toUpperCase(),
            postal_code: billingPostalCode,
            tax_regime: billingTaxRegime,
            cfdi_use: billingCfdiUse,
          }
        : null;

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
          billing: billingPayload,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (result?.diagnostic) {
          throw new Error(
            `[${result.stage}] code=${result.code ?? 'null'} — ${result.message}`,
          );
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
    } catch (err) {
      console.error('No se pudo crear la orden:', err);
      setError(friendlyOrderError(err));
    } finally {
      setLoading(false);
      submitLockRef.current = false;
    }
  };

  if (redirecting) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <Loader2 size={48} className="text-blue-600 mx-auto mb-4 animate-spin" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Redirigiendo a Stripe...
          </h2>
          <p className="text-gray-600">
            Serás llevado a la página segura de pago de Stripe.
          </p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          {paymentRedirectError ? (
            <>
              <AlertCircle size={64} className="text-amber-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                La orden fue creada, pero no pudimos iniciar el pago.
              </h2>
              <p className="text-gray-600 mb-6">
                Tu orden quedó registrada como pendiente. Puedes intentar el pago desde
                la sección <strong>Mis Órdenes</strong>.
              </p>
              <button
                onClick={onComplete}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition"
              >
                Ir a Mis Órdenes
              </button>
            </>
          ) : (
            <>
              <CheckCircle size={64} className="text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                ¡Orden registrada!
              </h2>
              <p className="text-gray-600 mb-6">
                Serás redirigido a Stripe para completar el pago de forma segura.
              </p>
            </>
          )}
          {successOrderId && (
            <p className="font-mono text-sm text-gray-500 mt-4">
              Orden #{successOrderId.slice(0, 8)}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <button
        onClick={step === 'credentials' ? onBack : () => setStep('credentials')}
        className="flex items-center space-x-2 text-blue-600 hover:text-blue-700 mb-6"
      >
        <ArrowLeft size={20} />
        <span>{step === 'credentials' ? 'Volver al carrito' : 'Volver a información de acceso'}</span>
      </button>

      <div className="mb-8">
        <div className="flex items-center justify-center space-x-4">
          <div className={`flex items-center ${step === 'credentials' ? 'text-blue-600' : 'text-green-600'}`}>
            <div className={`rounded-full w-8 h-8 flex items-center justify-center ${step === 'credentials' ? 'bg-blue-600' : 'bg-green-600'} text-white font-semibold`}>
              {step === 'payment' ? '✓' : '1'}
            </div>
            <span className="ml-2 font-medium">Información de Acceso</span>
          </div>
          <div className="w-16 h-1 bg-gray-300"></div>
          <div className={`flex items-center ${step === 'payment' ? 'text-blue-600' : 'text-gray-400'}`}>
            <div className={`rounded-full w-8 h-8 flex items-center justify-center ${step === 'payment' ? 'bg-blue-600' : 'bg-gray-300'} text-white font-semibold`}>
              2
            </div>
            <span className="ml-2 font-medium">Confirmación</span>
          </div>
        </div>
      </div>

      {step === 'credentials' ? (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Información de Acceso</h2>
            <p className="text-gray-600">Proporciona la información de acceso para cada servicio</p>
          </div>

          {items.map((item) => {
            const category = categories[item.service.category_id];
            if (!category) return null;

            return (
              <CredentialsForm
                key={item.id}
                service={item.service}
                category={category}
                onSubmit={(creds) => handleCredentialsSubmit(item.service_id, creds)}
              />
            );
          })}

          {!items.every((item) =>
            hasValidDetails(item.service.name, categories[item.service.category_id]?.name ?? '', item.details),
          ) && (
            <div className="flex items-center gap-2 text-amber-600 text-sm mb-3">
              <AlertCircle size={16} />
              <span>Completa los datos de personalización para todos los servicios antes de continuar</span>
            </div>
          )}

          <button
            onClick={() => setStep('payment')}
            disabled={!allCredentialsProvided() || !items.every((item) => hasValidDetails(item.service.name, categories[item.service.category_id]?.name ?? '', item.details))}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Continuar a Confirmación
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Resumen del Pedido</h2>

            <div className="bg-gray-50 rounded-lg p-6 space-y-4">
              {items.map((item) => (
                <div key={item.id} className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{item.service.name}</p>
                    <div className="my-1">
                      <ServiceDetails
                        serviceName={item.service.name}
                        categoryName={categories[item.service.category_id]?.name ?? ''}
                        details={item.details}
                      />
                    </div>
                    <p className="text-sm text-gray-600">
                      ${item.service.price.toFixed(2)} × {item.quantity}
                    </p>
                  </div>
                  <p className="font-bold text-blue-600 ml-4">
                    ${(item.service.price * item.quantity).toFixed(2)}
                  </p>
                </div>
              ))}

              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Subtotal:</span>
                  <span className="text-gray-900 font-semibold">
                    ${totalAmount.toFixed(2)}
                  </span>
                </div>

                {discountAmount > 0 && (
                  <div className="flex justify-between items-center text-green-600">
                    <span>Descuento (30%):</span>
                    <span className="font-semibold">
                      -${discountAmount.toFixed(2)}
                    </span>
                  </div>
                )}

                <div className="border-t pt-2 flex justify-between items-center">
                  <span className="text-lg font-semibold text-gray-900">Total:</span>
                  <span className="text-2xl font-bold text-blue-600">
                    ${finalAmount.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Método de pago</h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ¿Tienes un código de referido?
              </label>
              {!referralSuccess ? (
                <div className="flex space-x-2">
                  <div className="relative flex-1">
                    <Tag size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={referralCode}
                      onChange={(e) => {
                        setReferralCode(e.target.value.toUpperCase());
                        setReferralError('');
                      }}
                      placeholder="CÓDIGO"
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase"
                      maxLength={8}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyReferralCode}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition"
                  >
                    Aplicar
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-center space-x-2">
                    <Tag size={18} className="text-green-600" />
                    <span className="text-green-800 font-semibold">{referralCode}</span>
                    <span className="text-green-600 text-sm">- 30% de descuento aplicado</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveReferralCode}
                    className="text-green-600 hover:text-green-800 transition"
                  >
                    <X size={18} />
                  </button>
                </div>
              )}
              {referralError && (
                <p className="text-red-600 text-sm mt-2">{referralError}</p>
              )}
            </div>

            <div className="space-y-4">
              <label className="flex items-center p-4 border-2 rounded-lg cursor-pointer hover:border-blue-500 transition">
                <input
                  type="radio"
                  name="payment"
                  value="card"
                  checked={paymentMethod === 'card'}
                  onChange={() => {}}
                  className="mr-4"
                />
                <CreditCard className="text-blue-600 mr-3" size={24} />
                <div>
                  <p className="font-semibold text-gray-900">Tarjeta de Débito/Crédito</p>
                  <p className="text-sm text-gray-600">Visa, Mastercard, American Express</p>
                </div>
              </label>

              <label className="flex items-center p-4 border-2 rounded-lg cursor-not-allowed opacity-50 bg-gray-50">
                <input
                  type="radio"
                  name="payment"
                  value="paypal"
                  disabled
                  className="mr-4"
                />
                <div className="w-6 h-6 bg-blue-600 rounded-full mr-3"></div>
                <div>
                  <p className="font-semibold text-gray-900">PayPal</p>
                  <p className="text-sm text-gray-600">Próximamente</p>
                </div>
              </label>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900">
                <strong>Pago seguro con Stripe:</strong> Serás redirigido a la página de pago de
                Stripe para completar tu compra de forma segura. No almacenamos datos de tarjeta.
              </p>
            </div>

            <div className="border-t pt-6">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={wantsBilling}
                  onChange={(e) => setWantsBilling(e.target.checked)}
                  className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="font-medium text-gray-900">
                  ¿Requieres factura? (CFDI 4.0)
                </span>
              </label>
            </div>

            {wantsBilling && (
              <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                <h3 className="font-semibold text-gray-900 mb-4">Información Fiscal</h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    RFC *
                  </label>
                  <input
                    type="text"
                    value={billingRfc}
                    onChange={(e) => setBillingRfc(e.target.value.toUpperCase())}
                    placeholder="XAXX010101000"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase"
                    maxLength={13}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre o Razón Social *
                  </label>
                  <input
                    type="text"
                    value={billingLegalName}
                    onChange={(e) => setBillingLegalName(e.target.value.toUpperCase())}
                    placeholder="NOMBRE COMO APARECE EN CONSTANCIA FISCAL"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Código Postal Fiscal *
                  </label>
                  <input
                    type="text"
                    value={billingPostalCode}
                    onChange={(e) => setBillingPostalCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="12345"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    maxLength={5}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Régimen Fiscal *
                  </label>
                  <select
                    value={billingTaxRegime}
                    onChange={(e) => setBillingTaxRegime(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">Selecciona un régimen</option>
                    <option value="601">601 - General de Ley Personas Morales</option>
                    <option value="603">603 - Personas Morales con Fines no Lucrativos</option>
                    <option value="605">605 - Sueldos y Salarios e Ingresos Asimilados a Salarios</option>
                    <option value="606">606 - Arrendamiento</option>
                    <option value="608">608 - Demás ingresos</option>
                    <option value="610">610 - Residentes en el Extranjero sin Establecimiento Permanente</option>
                    <option value="611">611 - Ingresos por Dividendos</option>
                    <option value="612">612 - Personas Físicas con Actividades Empresariales y Profesionales</option>
                    <option value="614">614 - Ingresos por intereses</option>
                    <option value="616">616 - Sin obligaciones fiscales</option>
                    <option value="620">620 - Sociedades Cooperativas de Producción</option>
                    <option value="621">621 - Incorporación Fiscal</option>
                    <option value="622">622 - Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras</option>
                    <option value="623">623 - Opcional para Grupos de Sociedades</option>
                    <option value="624">624 - Coordinados</option>
                    <option value="625">625 - Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas</option>
                    <option value="626">626 - Régimen Simplificado de Confianza</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Uso del CFDI *
                  </label>
                  <select
                    value={billingCfdiUse}
                    onChange={(e) => setBillingCfdiUse(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="G03">G03 - Gastos en general</option>
                    <option value="S01">S01 - Sin efectos fiscales</option>
                  </select>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition disabled:bg-blue-400"
            >
              {loading ? 'Procesando...' : `Pagar ${finalAmount.toFixed(2)}`}
            </button>
          </form>
          </div>
        </div>
      )}
    </div>
  );
}
