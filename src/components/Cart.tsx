import { useState } from 'react';
import { AlertCircle, Edit3, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import { STRIPE_MINIMUM_MXN } from '../lib/stripeConstants';
import {
  getCategoryNameForService,
  hasValidDetails,
  normalizeDetails,
  type ServiceDetails as ServiceDetailsType,
} from '../lib/serviceCustomization';
import type { Category, Json, Service } from '../lib/database.types';
import { ServiceCustomizationModal } from './ServiceCustomizationModal';
import { ServiceDetails } from './ServiceDetails';
import { Alert, Badge, Button, Card, CardContent, Drawer, EmptyState } from './ui';

interface CartProps {
  isOpen: boolean;
  onClose: () => void;
  onCheckout: () => void;
}

interface CartItemWithService {
  id: string;
  service_id: string;
  quantity: number;
  details: Json;
  service: Service;
}

export function Cart({ isOpen, onClose, onCheckout }: CartProps) {
  const { items, updateQuantity, removeFromCart, updateItemDetails, totalAmount, totalItems } = useCart();
  const [editingItem, setEditingItem] = useState<CartItemWithService | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editMessage, setEditMessage] = useState<string | null>(null);

  const handleEditClick = (item: CartItemWithService) => {
    setEditMessage(null);
    setEditingItem(item);
    setEditingCategory({
      id: item.service.category_id,
      name: getCategoryNameForService(item.service.name),
      description: null,
      created_at: '',
    } as Category);
  };

  const handleEditConfirm = async (details: ServiceDetailsType, quantity: number) => {
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

    await updateItemDetails(editingItem.id, editingItem.service.name, details, quantity);
    setEditingItem(null);
    setEditingCategory(null);
  };

  const allItemsValid = items.every((item) =>
    hasValidDetails(item.service.name, getCategoryNameForService(item.service.name), item.details),
  );
  const missingAmount = Math.max(0, STRIPE_MINIMUM_MXN - totalAmount);
  const belowStripeMinimum = totalAmount < STRIPE_MINIMUM_MXN;
  const checkoutDisabled = !allItemsValid || belowStripeMinimum;

  const footer = items.length > 0 ? (
    <div className="w-full space-y-4">
      {!allItemsValid && (
        <Alert variant="warning" role="status" title="Faltan datos de personalización">
          Completa la información de todos los servicios para continuar.
        </Alert>
      )}

      {belowStripeMinimum && (
        <Alert variant="warning" role="status" title="Pago mínimo con tarjeta">
          Faltan ${missingAmount.toFixed(2)} MXN para alcanzar el pago mínimo con tarjeta.
        </Alert>
      )}

      <div className="flex items-end justify-between gap-4" aria-live="polite">
        <div>
          <p className="text-af-body-sm text-academy-text-muted">Total del carrito</p>
          <p className="text-af-h2 text-academy-primary">${totalAmount.toFixed(2)}</p>
        </div>
        <Badge variant="neutral">{totalItems} {totalItems === 1 ? 'artículo' : 'artículos'}</Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="secondary" onClick={onClose}>Agregar otro servicio</Button>
        <Button onClick={onCheckout} disabled={checkoutDisabled}>Continuar al checkout</Button>
      </div>
    </div>
  ) : undefined;

  return (
    <>
      <Drawer
        open={isOpen}
        onClose={onClose}
        title={`Carrito (${totalItems})`}
        ariaLabel="Carrito de servicios"
        className="max-w-lg"
        footer={footer}
      >
        {items.length === 0 ? (
          <EmptyState
            className="h-full min-h-80 justify-center"
            icon={<ShoppingBag className="h-12 w-12" />}
            title="Tu carrito está vacío"
            description="Agrega un servicio para comenzar tu pedido."
            action={<Button onClick={onClose}>Explorar servicios</Button>}
          />
        ) : (
          <div className="space-y-4">
            {items.map((item) => {
              const categoryName = getCategoryNameForService(item.service.name);
              const detailsValid = hasValidDetails(item.service.name, categoryName, item.details);
              const itemSubtotal = item.service.price * item.quantity;

              return (
                <Card key={item.id} className="shadow-none">
                  <CardContent className="space-y-4 p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-af-h4 text-academy-text">{item.service.name}</h3>
                        <p className="mt-1 text-af-body-sm text-academy-text-muted">
                          ${item.service.price.toFixed(2)} por unidad
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Eliminar ${item.service.name} del carrito`}
                        leadingIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                        onClick={() => removeFromCart(item.id)}
                      >
                        Eliminar
                      </Button>
                    </div>

                    {detailsValid ? (
                      <ServiceDetails
                        serviceName={item.service.name}
                        categoryName={categoryName}
                        details={item.details}
                      />
                    ) : (
                      <Alert variant="warning" role="status">
                        Falta completar la personalización.
                      </Alert>
                    )}

                    <div className="flex flex-col gap-4 border-t border-academy-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="mb-2 text-af-label text-academy-text">Cantidad</p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            aria-label={`Disminuir cantidad de ${item.service.name}`}
                            className="flex min-h-touch min-w-touch items-center justify-center rounded-af-md border border-academy-border bg-academy-surface text-academy-text hover:bg-academy-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary"
                          >
                            <Minus className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <span className="min-w-10 text-center font-semibold" aria-live="polite">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            aria-label={`Aumentar cantidad de ${item.service.name}`}
                            className="flex min-h-touch min-w-touch items-center justify-center rounded-af-md border border-academy-border bg-academy-surface text-academy-text hover:bg-academy-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary"
                          >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-end justify-between gap-4 sm:flex-col sm:items-end">
                        <div className="text-right">
                          <p className="text-af-body-sm text-academy-text-muted">Subtotal</p>
                          <p className="text-af-h4 text-academy-primary">${itemSubtotal.toFixed(2)}</p>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          leadingIcon={detailsValid ? <Edit3 className="h-4 w-4" aria-hidden="true" /> : <AlertCircle className="h-4 w-4" aria-hidden="true" />}
                          onClick={() => handleEditClick(item)}
                        >
                          {detailsValid ? 'Editar' : 'Completar datos'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </Drawer>

      {editingItem && editingCategory && (
        <ServiceCustomizationModal
          service={editingItem.service}
          category={editingCategory}
          mode="edit"
          existingDetails={editingItem.details}
          existingQuantity={editingItem.quantity}
          onConfirm={handleEditConfirm}
          onClose={() => {
            setEditingItem(null);
            setEditingCategory(null);
          }}
        />
      )}

      {editMessage && (
        <div role="status" className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-af-md border border-amber-300 bg-amber-50 px-6 py-3 text-amber-900 shadow-af-elevated">
          {editMessage}
        </div>
      )}
    </>
  );
}
