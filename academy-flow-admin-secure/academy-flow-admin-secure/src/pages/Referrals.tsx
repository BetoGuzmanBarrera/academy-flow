import { useEffect, useState } from 'react';
import { Gift, Users, Copy, CheckCircle2, Share2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { ReferralCode, ReferralUse } from '../lib/database.types';

export function Referrals() {
  const { user } = useAuth();
  const [referralCode, setReferralCode] = useState<ReferralCode | null>(null);
  const [referralUses, setReferralUses] = useState<ReferralUse[]>([]);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadReferralData();
    } else {
      setLoading(false);
    }
  }, [user]);

  const loadReferralData = async () => {
    if (!user) return;

    const { data: code } = await supabase
      .from('referral_codes')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (code) {
      setReferralCode(code);

      const { data: uses } = await supabase
        .from('referral_uses')
        .select('*')
        .eq('referral_code_id', code.id)
        .order('created_at', { ascending: false });

      if (uses) {
        setReferralUses(uses);
      }
    }

    setLoading(false);
  };

  const handleCopyCode = () => {
    if (referralCode) {
      navigator.clipboard.writeText(referralCode.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const totalSavings = referralUses.reduce((sum, use) => sum + use.discount_amount, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Programa de Referidos</h1>
        <div className="w-24 h-1 bg-blue-600 mx-auto"></div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8 mb-16">
        <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-8 text-white">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-white/20 rounded-full p-3">
              <Gift size={32} />
            </div>
            <h2 className="text-3xl font-bold">¡Gana Juntos!</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="bg-white/20 rounded-full p-2 mt-1">
                <span className="text-white font-bold">1</span>
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">Compra y Obtén tu Código</h3>
                <p className="text-blue-100">
                  Después de tu primera compra, recibirás automáticamente tu código de referido único.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="bg-white/20 rounded-full p-2 mt-1">
                <span className="text-white font-bold">2</span>
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">Comparte con Amigos</h3>
                <p className="text-blue-100">
                  Envía tu código a amigos y familiares que necesiten nuestros servicios.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="bg-white/20 rounded-full p-2 mt-1">
                <span className="text-white font-bold">3</span>
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">Ellos Ahorran 30%</h3>
                <p className="text-blue-100">
                  Tus amigos obtienen un 30% de descuento en cualquier servicio al usar tu código.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center space-x-3 mb-4">
              <Share2 className="text-blue-600" size={24} />
              <h3 className="text-xl font-bold text-gray-900">Tu Código de Referido</h3>
            </div>

            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              </div>
            ) : !user ? (
              <div className="bg-gray-50 rounded-lg p-6 text-center">
                <p className="text-gray-600 mb-4">
                  Inicia sesión para ver tu código de referido
                </p>
              </div>
            ) : referralCode ? (
              <div>
                <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-6 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Tu código</p>
                      <p className="text-3xl font-bold text-blue-600 tracking-wider">
                        {referralCode.code}
                      </p>
                    </div>
                    <button
                      onClick={handleCopyCode}
                      className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
                    >
                      {copied ? (
                        <>
                          <CheckCircle2 size={18} />
                          <span>Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy size={18} />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-gray-900">{referralCode.uses_count}</p>
                    <p className="text-sm text-gray-600">Usos Totales</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-green-600">${totalSavings.toFixed(2)}</p>
                    <p className="text-sm text-gray-600">Ahorros Generados</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg p-6 text-center">
                <p className="text-gray-600 mb-2">
                  Realiza tu primera compra para obtener tu código de referido
                </p>
                <p className="text-sm text-gray-500">
                  Tu código se generará automáticamente después de completar tu orden
                </p>
              </div>
            )}
          </div>

          {referralUses.length > 0 && (
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex items-center space-x-3 mb-4">
                <Users className="text-blue-600" size={24} />
                <h3 className="text-xl font-bold text-gray-900">Historial de Usos</h3>
              </div>

              <div className="space-y-3">
                {referralUses.slice(0, 5).map((use) => (
                  <div key={use.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(use.created_at).toLocaleDateString('es-ES')}
                      </p>
                      <p className="text-xs text-gray-600">
                        Orden #{use.order_id.slice(0, 8)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-green-600">
                        ${use.discount_amount.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-600">Ahorrado</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Preguntas Frecuentes</h2>

        <div className="space-y-6 max-w-3xl mx-auto">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              ¿Cuántas veces puedo usar mi código de referido?
            </h3>
            <p className="text-gray-600">
              ¡Ilimitadas! Comparte tu código tantas veces como quieras. No hay límite en la cantidad de personas que pueden usarlo.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              ¿El descuento aplica a todos los servicios?
            </h3>
            <p className="text-gray-600">
              Sí, el descuento del 30% se aplica a cualquier servicio de ALEKS, Cambridge One, Coursera o National Geographic Learning.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              ¿Puedo usar mi propio código de referido?
            </h3>
            <p className="text-gray-600">
              No, los códigos de referido son para compartir con amigos y familiares. No puedes aplicar tu propio código a tus compras.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              ¿Cuándo recibo mi código de referido?
            </h3>
            <p className="text-gray-600">
              Tu código se genera automáticamente después de completar tu primera compra. Podrás verlo en esta página y compartirlo inmediatamente.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
