export const CONTACT_CONFIG = {
  whatsapp: {
    number: '',
    defaultMessage: 'Hola, necesito ayuda con mi servicio de Academy Flow.',
  orderMessageTemplate: 'Hola, necesito ayuda con mi orden #{orderId}.',
  placeholderNote: 'Colocar el número oficial de WhatsApp aquí (formato: 521XXXXXXXXXX, sin + ni espacios).',
  enabled: false,
  },
  instagram: {
    username: '',
    placeholderNote: 'Colocar el usuario oficial de Instagram aquí (sin @).',
    enabled: false,
  },
} as const;

export function buildWhatsAppUrl(message: string): string {
  const number = CONTACT_CONFIG.whatsapp.number;
  if (!number) return '';
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export function buildInstagramUrl(): string {
  const username = CONTACT_CONFIG.instagram.username;
  if (!username) return '';
  return `https://instagram.com/${username}`;
}

export function buildOrderMessage(orderId: string): string {
  const shortId = orderId.slice(0, 8);
  return CONTACT_CONFIG.whatsapp.orderMessageTemplate.replace('{orderId}', shortId);
}
