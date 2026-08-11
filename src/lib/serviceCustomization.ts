import type { Json } from './database.types';

const ALEKS_SUBJECTS = ['Álgebra', 'Matemáticas Aplicadas', 'Cálculo'] as const;
export type AleksSubject = (typeof ALEKS_SUBJECTS)[number];

export const FIXED_QUANTITY_SERVICES = new Set([
  'Preparación para examen parcial',
  'Preparación para examen final',
  'Preparación para Verificación Inicial de Conocimientos',
  'Preparación para Verificación de Conocimientos',
  'Guía de preparación para examen',
  'Acompañamiento semanal de francés',
  'Acompañamiento urgente de francés',
]);

export interface QuantityLimits {
  min: number;
  max: number | null;
  fixed: boolean;
}

export function isFixedQuantity(serviceName: string): boolean {
  return FIXED_QUANTITY_SERVICES.has(serviceName);
}

export function getQuantityLimits(serviceName: string): QuantityLimits {
  switch (serviceName) {
    case 'Acompañamiento por tema de parcial':
      return { min: 1, max: 196, fixed: false };
    case 'Asesoría para tareas colaborativas':
      return { min: 1, max: 40, fixed: false };
    case 'Asesoría para tareas individuales':
      return { min: 1, max: 40, fixed: false };
    case 'Acompañamiento para Unidad Abierta':
      return { min: 1, max: null, fixed: false };
    case 'Acompañamiento urgente de unidad':
      return { min: 1, max: null, fixed: false };
    default:
      return { min: 1, max: 1, fixed: true };
  }
}

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'select' | 'textarea';
  required: boolean;
  maxLength?: number;
  options?: readonly string[];
  placeholder?: string;
}

export function getServiceFields(
  serviceName: string,
  categoryName: string,
): FieldDef[] {
  const cat = categoryName.toUpperCase();
  const instructionsField: FieldDef = {
    key: 'additionalInstructions',
    label: 'Instrucciones adicionales',
    type: 'textarea',
    required: false,
    maxLength: 500,
    placeholder: 'Indica cualquier detalle que debamos conocer (máx. 500 caracteres)',
  };

  if (cat === 'ALEKS UNIVERSIDAD') {
    const subjectField: FieldDef = {
      key: 'subject',
      label: 'Materia',
      type: 'select',
      required: true,
      options: ALEKS_SUBJECTS,
    };

    switch (serviceName) {
      case 'Preparación para examen parcial':
        return [
          subjectField,
          {
            key: 'partial',
            label: 'Parcial',
            type: 'select',
            required: true,
            options: ['1', '2', '3'],
          },
          instructionsField,
        ];
      case 'Preparación para examen final':
        return [subjectField, instructionsField];
      case 'Acompañamiento por tema de parcial':
        return [
          subjectField,
          {
            key: 'partial',
            label: 'Parcial (opcional)',
            type: 'select',
            required: false,
            options: ['1', '2', '3'],
          },
          instructionsField,
        ];
      case 'Preparación para Verificación Inicial de Conocimientos':
        return [subjectField, instructionsField];
      case 'Asesoría para tareas colaborativas':
        return [subjectField, instructionsField];
      case 'Asesoría para tareas individuales':
        return [subjectField, instructionsField];
      case 'Preparación para Verificación de Conocimientos':
        return [
          subjectField,
          {
            key: 'moduleOrPartial',
            label: 'Módulo o parcial (opcional)',
            type: 'text',
            required: false,
            maxLength: 100,
            placeholder: 'Ej. Módulo 3, Parcial 2…',
          },
          instructionsField,
        ];
    }
  }

  if (cat === 'CAMBRIDGE ONE') {
    const levelField: FieldDef = {
      key: 'level',
      label: 'Nivel',
      type: 'text',
      required: true,
      maxLength: 100,
      placeholder: 'Ej. A2, B1, B2…',
    };

    switch (serviceName) {
      case 'Acompañamiento para Unidad Abierta':
        return [
          levelField,
          {
            key: 'unit',
            label: 'Unidad',
            type: 'text',
            required: true,
            maxLength: 100,
            placeholder: 'Número o nombre de la unidad',
          },
          instructionsField,
        ];
      case 'Guía de preparación para examen':
        return [
          levelField,
          {
            key: 'exam',
            label: 'Examen (opcional)',
            type: 'text',
            required: false,
            maxLength: 100,
            placeholder: 'Nombre del examen',
          },
          instructionsField,
        ];
      case 'Acompañamiento urgente de unidad':
        return [
          levelField,
          {
            key: 'unit',
            label: 'Unidad',
            type: 'text',
            required: true,
            maxLength: 100,
            placeholder: 'Número o nombre de la unidad',
          },
          instructionsField,
        ];
    }
  }

  if (cat === 'FRANCÉS — BIBLIO EXOS') {
    return [
      {
        key: 'week',
        label: 'Semana',
        type: 'select',
        required: true,
        options: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13'],
      },
      instructionsField,
    ];
  }

  return [instructionsField];
}

export function getAllowedKeys(serviceName: string, categoryName: string): string[] {
  return getServiceFields(serviceName, categoryName).map((f) => f.key);
}

export type ServiceDetails = Record<string, string>;

export function normalizeDetails(
  serviceName: string,
  details: Json | undefined | null,
): ServiceDetails {
  const allowed = getAllowedKeys(serviceName, getCategoryNameForService(serviceName));
  const result: ServiceDetails = {};

  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return result;
  }

  const obj = details as Record<string, unknown>;

  for (const key of allowed) {
    const value = obj[key];

    if (value === undefined || value === null) continue;

    if (key === 'week') {
      const num = typeof value === 'number' ? value : parseInt(String(value), 10);
      if (Number.isInteger(num)) {
        result[key] = String(num);
      }
      continue;
    }

    if (typeof value !== 'string') continue;

    const trimmed = value.trim();
    if (trimmed === '') continue;

    result[key] = trimmed;
  }

  return result;
}

export function getCategoryNameForService(serviceName: string): string {
  const name = serviceName.toLowerCase();
  if (name.includes('parcial') || name.includes('verificación') || name.includes('tareas') || name.includes('examen final')) {
    return 'ALEKS Universidad';
  }
  if (name.includes('unidad') || name.includes('guía') || name.includes('examen')) {
    return 'CAMBRIDGE ONE';
  }
  if (name.includes('francés')) {
    return 'Francés — Biblio Exos';
  }
  return '';
}

export function detailsToKey(details: ServiceDetails): string {
  const keys = Object.keys(details).sort();
  return keys.map((k) => `${k}:${details[k]}`).join('|');
}

export function detailsEqual(
  serviceName: string,
  a: Json | undefined | null,
  b: Json | undefined | null,
): boolean {
  return detailsToKey(normalizeDetails(serviceName, a)) === detailsToKey(normalizeDetails(serviceName, b));
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateDetails(
  serviceName: string,
  categoryName: string,
  details: ServiceDetails,
): ValidationResult {
  const errors: string[] = [];
  const fields = getServiceFields(serviceName, categoryName);

  for (const field of fields) {
    const value = details[field.key];

    if (field.required && (value === undefined || value.trim() === '')) {
      errors.push(`El campo "${field.label}" es obligatorio`);
      continue;
    }

    if (value === undefined || value === '') continue;

    if (field.maxLength && value.length > field.maxLength) {
      errors.push(`El campo "${field.label}" no puede exceder ${field.maxLength} caracteres`);
    }

    if (field.type === 'select' && field.options && !field.options.includes(value)) {
      errors.push(`El valor de "${field.label}" no es válido`);
    }
  }

  const allowed = getAllowedKeys(serviceName, categoryName);
  for (const key of Object.keys(details)) {
    if (!allowed.includes(key)) {
      errors.push(`La clave "${key}" no es válida para este servicio`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function hasValidDetails(
  serviceName: string,
  categoryName: string,
  details: Json | undefined | null,
): boolean {
  const normalized = normalizeDetails(serviceName, details);
  return validateDetails(serviceName, categoryName, normalized).valid;
}

export function formatDetailsLabels(
  serviceName: string,
  categoryName: string,
  details: Json | undefined | null,
): { label: string; value: string }[] {
  const normalized = normalizeDetails(serviceName, details);
  const fields = getServiceFields(serviceName, categoryName);
  const result: { label: string; value: string }[] = [];

  for (const field of fields) {
    const value = normalized[field.key];
    if (value !== undefined && value !== '') {
      result.push({ label: field.label, value });
    }
  }

  return result;
}
