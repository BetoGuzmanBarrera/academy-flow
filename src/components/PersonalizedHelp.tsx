import { MessageCircle, Instagram, Headphones } from 'lucide-react';
import { CONTACT_CONFIG, buildWhatsAppUrl, buildInstagramUrl, buildOrderMessage } from '../lib/contactConfig';

interface PersonalizedHelpProps {
  orderId?: string;
  onOpenInternalSupport?: () => void;
}

export function PersonalizedHelp({ orderId, onOpenInternalSupport }: PersonalizedHelpProps) {
  const whatsappMessage = orderId ? buildOrderMessage(orderId) : CONTACT_CONFIG.whatsapp.defaultMessage;
  const whatsappUrl = buildWhatsAppUrl(whatsappMessage);
  const instagramUrl = buildInstagramUrl();

  const waEnabled = CONTACT_CONFIG.whatsapp.enabled && whatsappUrl !== '';
  const igEnabled = CONTACT_CONFIG.instagram.enabled && instagramUrl !== '';

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="bg-blue-100 rounded-full p-2 shrink-0">
          <Headphones size={20} className="text-blue-600" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 text-base sm:text-lg">
            ¿Necesitas ayuda personalizada?
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Podemos ayudarte con tu pedido, acceso a la plataforma o cualquier duda sobre tu servicio.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {waEnabled ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-3 rounded-lg font-semibold text-sm hover:bg-green-700 transition"
          >
            <MessageCircle size={18} />
            WhatsApp
          </a>
        ) : (
          <div
            className="flex items-center justify-center gap-2 bg-gray-100 text-gray-400 px-4 py-3 rounded-lg font-semibold text-sm cursor-not-allowed"
            title={CONTACT_CONFIG.whatsapp.placeholderNote}
          >
            <MessageCircle size={18} />
            WhatsApp
          </div>
        )}

        {igEnabled ? (
          <a
            href={instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-pink-500 to-purple-500 text-white px-4 py-3 rounded-lg font-semibold text-sm hover:from-pink-600 hover:to-purple-600 transition"
          >
            <Instagram size={18} />
            Instagram
          </a>
        ) : (
          <div
            className="flex items-center justify-center gap-2 bg-gray-100 text-gray-400 px-4 py-3 rounded-lg font-semibold text-sm cursor-not-allowed"
            title={CONTACT_CONFIG.instagram.placeholderNote}
          >
            <Instagram size={18} />
            Instagram
          </div>
        )}

        <button
          onClick={onOpenInternalSupport}
          className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-lg font-semibold text-sm hover:bg-blue-700 transition"
        >
          <Headphones size={18} />
          Soporte Academy Flow
        </button>
      </div>

      {!waEnabled && !igEnabled && (
        <p className="text-xs text-gray-400 mt-3 text-center">
          Próximamente disponible. Mientras tanto, usa el soporte interno.
        </p>
      )}
    </div>
  );
}
