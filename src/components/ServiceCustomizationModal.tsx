import { useState, useEffect, useMemo } from 'react';
import { X, ShoppingCart, CreditCard as Edit3 } from 'lucide-react';
import type { Service, Category, Json } from '../lib/database.types';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{service.name}</h2>
            <p className="text-sm text-gray-500">{category.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition"
            disabled={submitting}
          >
            <X size={22} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {service.description && (
            <p className="text-sm text-gray-600">{service.description}</p>
          )}

          {fields.map((field) => {
            const value = details[field.key] ?? '';

            if (field.type === 'textarea') {
              return (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {field.label}
                    {!field.required && (
                      <span className="text-gray-400 font-normal ml-1">(opcional)</span>
                    )}
                  </label>
                  <textarea
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {field.label}
                    {!field.required && (
                      <span className="text-gray-400 font-normal ml-1">(opcional)</span>
                    )}
                  </label>
                  <select
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {field.label}
                  {!field.required && (
                    <span className="text-gray-400 font-normal ml-1">(opcional)</span>
                  )}
                </label>
                <input
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cantidad
            </label>
            {limits.fixed ? (
              <div className="flex items-center gap-2">
                <span className="px-4 py-2 bg-gray-100 rounded-lg text-sm font-medium text-gray-600">
                  1 (cantidad fija)
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleQuantityChange(-1)}
                  className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                  disabled={submitting || quantity <= limits.min}
                >
                  <span className="text-lg leading-none">−</span>
                </button>
                <span className="w-16 text-center font-semibold text-lg">{quantity}</span>
                <button
                  type="button"
                  onClick={() => handleQuantityChange(1)}
                  className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
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
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
              {errors.map((err, i) => (
                <p key={i} className="text-sm text-red-700">{err}</p>
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

        <div className="flex gap-3 p-5 border-t sticky bottom-0 bg-white rounded-b-2xl">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {mode === 'edit' ? (
              <>
                <Edit3 size={18} />
                {submitting ? 'Guardando…' : 'Guardar cambios'}
              </>
            ) : (
              <>
                <ShoppingCart size={18} />
                {submitting ? 'Agregando…' : 'Agregar al carrito'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
