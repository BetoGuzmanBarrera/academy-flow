import type { Service } from './database.types';

export type AdminServiceDraft = {
  name: string;
  description: string;
  price: string;
  categoryId: string;
  isActive: boolean;
};

export type AdminServiceWritePayload = {
  name: string;
  description: string | null;
  price: number;
  category_id: string;
  is_active: boolean;
};

type DraftValidation =
  | { valid: true; payload: AdminServiceWritePayload }
  | { valid: false; error: string };

type MutationLock = { current: boolean };

const PRICE_PATTERN = /^\d+(?:\.\d{1,2})?$/;

export function serviceToAdminDraft(service: Service): AdminServiceDraft {
  return {
    name: service.name,
    description: service.description ?? '',
    price: String(service.price),
    categoryId: service.category_id ?? '',
    isActive: service.is_active,
  };
}

export function validateAdminServiceDraft(draft: AdminServiceDraft): DraftValidation {
  const name = draft.name.trim();
  const categoryId = draft.categoryId.trim();
  const priceText = draft.price.trim();

  if (!name) {
    return { valid: false, error: 'El nombre del servicio es obligatorio.' };
  }

  if (!categoryId) {
    return { valid: false, error: 'Selecciona una categoría.' };
  }

  if (!priceText || !PRICE_PATTERN.test(priceText)) {
    return {
      valid: false,
      error: 'El precio debe ser un número igual o mayor que cero con máximo dos decimales.',
    };
  }

  const price = Number(priceText);
  if (!Number.isFinite(price) || price < 0) {
    return {
      valid: false,
      error: 'El precio debe ser un número igual o mayor que cero con máximo dos decimales.',
    };
  }

  return {
    valid: true,
    payload: {
      name,
      description: draft.description.trim() || null,
      price,
      category_id: categoryId,
      is_active: draft.isActive,
    },
  };
}

export function replaceAdminService(services: Service[], updated: Service): Service[] {
  return services.map((service) => (service.id === updated.id ? updated : service));
}

export function getAdminServiceStatusLabel(isActive: boolean): 'Activo' | 'Inactivo' {
  return isActive ? 'Activo' : 'Inactivo';
}

export async function runCatalogMutationOnce<T>(
  lock: MutationLock,
  mutation: () => Promise<T>,
): Promise<T | null> {
  if (lock.current) return null;

  lock.current = true;
  try {
    return await mutation();
  } finally {
    lock.current = false;
  }
}
