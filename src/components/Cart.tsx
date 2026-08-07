import { useState } from 'react';
import { X, Plus, Minus, Trash2, ShoppingBag, Edit3, AlertCircle } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import { ServiceDetails } from './ServiceDetails';
import { ServiceCustomizationModal } from './ServiceCustomizationModal';
import { hasValidDetails, normalizeDetails, type ServiceDetails as ServiceDetailsType } from '../lib/serviceCustomization';
import type { Service, Category } from '../lib/database.types';

interface CartProps {
  isOpen: boolean;
  onClose: () => void;
  onCheckout: () => void;
}

interface CartItemWithService {
  id: string;
  service_id: string;
  quantity: number;
  details: import('../lib/database.types').Json;
  service: Service;
}

export function Cart({ isOpen, onClose, onCheckout }: CartProps) {
  const { items, updateQuantity, removeFromCart, updateItemDetails, totalAmount, totalItems } = useCart();
  const [editingItem, setEditingItem] = useState<CartItemWithService | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editMessage, setEditMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleEditClick = (item: CartItemWithService) => {
    setEditMessage(null);
    setEditingItem(item);
    setEditingCategory({
      id: item.service.category_id,
      name: getCategoryName(item.service.category_id),
      description: null,
      created_at: '',
    } as Category);
  };

  const getCategoryName = (categoryId: string): string => {
    const item = items.find((i) => i.service.category_id === categoryId);
    return item?.service?.name?.includes('parcial') || item?.service?.name?.includes('Verificación') || item?.service?.name?.includes('tareas')
      ? 'ALEKS Universidad'
      : item?.service?.name?.includes('Unidad') || item?.service?.name?.includes('examen')
        ? 'CAMBRIDGE ONE'
        : item?.service?.name?.includes('francés')
          ? 'Francés — Biblio Exos'
          : '';
  };

  const handleEditConfirm = async (details: ServiceDetailsType, _quantity: number) => {
    if (!editingItem || !editingCategory) return;

    const normalized = normalizeDetails(editingItem.service.name, details);

    const conflict = items.find(
      (item) =>
        item.id !== editingItem.id &&
        item.service_id === editingItem.service_id &&
        JSON.stringify(normalizeDetails(editingItem.service.name, item.details)) ===
          JSON.stringify(normalized),
    );

    if (conflict) {
      setEditMessage('Esta configuración ya está en tu carrito');
      return;
    }

    await updateItemDetails(editingItem.id, editingItem.service.name, details);
    setEditingItem(null);
    setEditingCategory(null);
  };

  const allItemsValid = items.every((item) =>
    hasValidDetails(item.service.name, getCategoryName(item.service.category_id), item.details),
  );

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>

      <div className="absolute right-0 top-0 h-full w-full sm:w-96 bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold text-gray-900">
            Carrito ({totalItems})
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <ShoppingBag size={64} className="text-gray-300 mb-4" />
              <p className="text-gray-500 text-lg">Tu carrito está vacío</p>
              <p className="text-gray-400 text-sm mt-2">
                Agrega servicios para comenzar
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => {
                const categoryName = getCategoryName(item.service.category_id);
                const detailsValid = hasValidDetails(item.service.name, categoryName, item.details);

                return (
                  <div key={item.id} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{item.service.name}</h3>
                        <p className="text-sm text-gray-600 mt-1">
                          ${item.service.price.toFixed(2)} c/u
                        </p>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded transition"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>

                    {detailsValid ? (
                      <div className="mb-3">
                        <ServiceDetails
                          serviceName={item.service.name}
                          categoryName={categoryName}
                          details={item.details}
                        />
                      </div>
                    ) : (
                      <div className="mb-3">
                        <div className="flex items-center gap-2 text-amber-600 text-sm mb-2">
                          <AlertCircle size={16} />
                          <span>Falta completar la personalización</span>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="p-1 bg-white border border-gray-300 rounded hover:bg-gray-50 transition"
                        >
                          <Minus size={16} />
                        </button>

                        <span className="w-12 text-center font-semibold">
                          {item.quantity}
                        </span>

                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="p-1 bg-white border border-gray-300 rounded hover:bg-gray-50 transition"
                        >
                          <Plus size={16} />
                        </button>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleEditClick(item)}
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm font-medium transition"
                        >
                          {detailsValid ? (
                            <>
                              <Edit3 size={14} />
                              Editar
                            </>
                          ) : (
                            'Completar datos'
                          )}
                        </button>

                        <div className="font-bold text-blue-600">
                          ${(item.service.price * item.quantity).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t p-4 space-y-4">
            {!allItemsValid && (
              <div className="flex items-center gap-2 text-amber-600 text-sm">
                <AlertCircle size={16} />
                <span>Completa los datos de personalización para continuar</span>
              </div>
            )}

            <div className="flex justify-between items-center text-lg">
              <span className="font-semibold text-gray-900">Total:</span>
              <span className="font-bold text-2xl text-blue-600">
                ${totalAmount.toFixed(2)}
              </span>
            </div>

            <button
              onClick={onCheckout}
              disabled={!allItemsValid}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Proceder al Pago
            </button>
          </div>
        )}
      </div>

      {editingItem && editingCategory && (
        <ServiceCustomizationModal
          service={editingItem.service}
          category={editingCategory}
          mode="edit"
          existingDetails={editingItem.details as any}
          existingQuantity={editingItem.quantity}
          onConfirm={handleEditConfirm}
          onClose={() => {
            setEditingItem(null);
            setEditingCategory(null);
          }}
        />
      )}

      {editMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-amber-50 border border-amber-300 text-amber-800 px-6 py-3 rounded-lg shadow-lg">
          {editMessage}
        </div>
      )}
    </div>
  );
}
