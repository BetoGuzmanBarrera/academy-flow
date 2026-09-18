import { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, CreditCard as Edit3 } from 'lucide-react';
import type { Service, Category, Json } from '../lib/database.types';
import { Modal } from './ui';
import {
  getServiceFields,
  getQuantityLimits,
  normalizeDetails,
  validateDetails,
  type ServiceDetails as ServiceDetailsType,
} from '../lib/serviceCustomization';

interface ServiceCustomizationModalProps {
  service: Service;
  category: Category;
  mode: 'add' | 'edit';
  existingDetails?: Json;
  existingQuantity?: number;
  onConfirm: (details: ServiceDetailsType, quantity: number) => Promise<void>;
  onClose: () => void;
}

export function ServiceCustomizationModal({
  service,
  category,
  mode,
  existingDetails,
  existingQuantity,
  onConfirm,
  onClose,
}: ServiceCustomizationModalProps) {
  const fields = useMemo(
    () => getServiceFields(service.name, category.name),
    [service.name, category.name],
  );
  const limits = useMemo(() => getQuantityLimits(service.name), [service.name]);

  const [details, setDetails] = useState<ServiceDetailsType>(() =>
    normalizeDetails(service.name, existingDetails),
  );
  const [quantity, setQuantity] = useState(existingQuantity ?? limits.min);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setDetails(normalizeDetails(service.name, existingDetails));
    setQuantity(existingQuantity ?? limits.min);
  }, [existingDetails, existingQuantity, limits.min, service.name]);

  const handleFieldChange = (key: string, value: string) => {
    setDetails((prev) => ({ ...prev, [key]: value }));
    setErrors([]);
  };

  const handleQuantityChange = (delta: number) => {
    setQuantity((prev) => {
      const next = prev + delta;
      if (next < limits.min) return limits.min;
      if (limits.max !== null && next > limits.max) return limits.max;
      return next;
    });
  };

  const handleSubmit = async () => {
    const validation = validateDetails(service.name, category.name, details);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setSubmitting(true);
    try {
      await onConfirm(details, quantity);
    } finally {
      setSubmitting(false);
    }
  };

  const unitPrice = service.price;
  const totalPrice = unitPrice * quantity;

  return (
    <Modal
      open
      onClose={onClose}
      title={service.name}
      dismissible={!submitting}
      className="max-w-lg"
      footer={(
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="min-h-touch flex-1 rounded-lg border border-gray-300 px-4 py-2.5 font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="flex min-h-touch flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {mode === 'edit' ? (
              <>
                <Edit3 size={18} aria-hidden="true" />
                {submitting ? 'Guardando…' : 'Guardar cambios'}
              </>
            ) : (
              <>
                <ShoppingCart size={18} aria-hidden="true" />
                {submitting ? 'Agregando…' : 'Agregar al carrito'}
              </>
            )}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
          <p className="text-sm text-gray-500">{category.name}</p>
          {service.description && (
            <p className="text-sm text-gray-600">{service.description}</p>
          )}

          {fields.map((field) => {
            const value = details[field.key] ?? '';
            const fieldId = `service-customization-${field.key}`;

            if (field.type === 'textarea') {
              return (
                <div key={field.key}>
                  <label htmlFor={fieldId} className="block text-sm font-medium text-gray-700 mb-1">
                    {field.label}
                    {!field.required && (
                      <span className="text-gray-400 font-normal ml-1">(opcional)</span>
                    )}
                  </label>
                  <textarea
                    id={fieldId}
                    value={value}
                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    maxLength={field.maxLength}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    disabled={submitting}
                  />
                  {field.maxLength && value.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      {value.length}/{field.maxLength} caracteres
                    </p>
                  )}
                </div>
              );
            }

            if (field.type === 'select') {
              return (
                <div key={field.key}>
                  <label htmlFor={fieldId} className="block text-sm font-medium text-gray-700 mb-1">
                    {field.label}
                    {!field.required && (
                      <span className="text-gray-400 font-normal ml-1">(opcional)</span>
                    )}
                  </label>
                  <select
                    id={fieldId}
                    value={value}
                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
                    disabled={submitting}
                  >
                    <option value="">
                      {field.required ? 'Selecciona…' : 'Sin especificar'}
                    </option>
                    {field.options?.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              );
            }

            return (
              <div key={field.key}>
                <label htmlFor={fieldId} className="block text-sm font-medium text-gray-700 mb-1">
                  {field.label}
                  {!field.required && (
                    <span className="text-gray-400 font-normal ml-1">(opcional)</span>
                  )}
                </label>
                <input
                  id={fieldId}
                  type="text"
                  value={value}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  maxLength={field.maxLength}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  disabled={submitting}
                />
              </div>
            );
          })}

          <div>
            <p id="service-customization-quantity-label" className="block text-sm font-medium text-gray-700 mb-2">
              Cantidad
            </p>
            {limits.fixed ? (
              <div className="flex items-center gap-2" aria-labelledby="service-customization-quantity-label">
                <span className="px-4 py-2 bg-gray-100 rounded-lg text-sm font-medium text-gray-600">
                  1 (cantidad fija)
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-3" role="group" aria-labelledby="service-customization-quantity-label">
                <button
                  type="button"
                  onClick={() => handleQuantityChange(-1)}
                  aria-label="Disminuir cantidad"
                  className="flex min-h-touch min-w-touch items-center justify-center rounded-lg border border-gray-300 bg-white p-2 transition hover:bg-gray-50"
                  disabled={submitting || quantity <= limits.min}
                >
                  <span className="text-lg leading-none">−</span>
                </button>
                <span className="w-16 text-center font-semibold text-lg" aria-live="polite">{quantity}</span>
                <button
                  type="button"
                  onClick={() => handleQuantityChange(1)}
                  aria-label="Aumentar cantidad"
                  className="flex min-h-touch min-w-touch items-center justify-center rounded-lg border border-gray-300 bg-white p-2 transition hover:bg-gray-50"
                  disabled={submitting || (limits.max !== null && quantity >= limits.max)}
                >
                  <span className="text-lg leading-none">+</span>
                </button>
                {limits.max !== null && (
                  <span className="text-sm text-gray-400 ml-2">máx. {limits.max}</span>
                )}
              </div>
            )}
          </div>

          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1" role="alert">
              {errors.map((err) => (
                <p key={err} className="text-sm text-red-700">{err}</p>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <div className="text-sm text-gray-500">
              ${unitPrice.toFixed(2)} {limits.fixed ? '' : `× ${quantity}`} ={' '}
              <span className="font-bold text-blue-600 text-lg">
                ${totalPrice.toFixed(2)}
              </span>
            </div>
          </div>
      </div>
    </Modal>
  );
}
