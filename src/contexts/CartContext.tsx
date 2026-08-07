import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import type { Service, Json } from '../lib/database.types';
import {
  isFixedQuantity,
  getQuantityLimits,
  normalizeDetails,
  detailsEqual,
  detailsToKey,
  type ServiceDetails,
} from '../lib/serviceCustomization';

interface CartItemWithService {
  id: string;
  service_id: string;
  quantity: number;
  details: Json;
  service: Service;
}

export interface AddToCartResult {
  success: boolean;
  message?: string;
}

interface CartContextType {
  items: CartItemWithService[];
  loading: boolean;
  addToCart: (
    serviceId: string,
    serviceName: string,
    categoryName: string,
    details: ServiceDetails,
    quantity?: number,
  ) => Promise<AddToCartResult>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  updateItemDetails: (
    itemId: string,
    serviceName: string,
    details: ServiceDetails,
  ) => Promise<void>;
  removeFromCart: (itemId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  totalAmount: number;
  totalItems: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItemWithService[]>([]);
  const [loading, setLoading] = useState(false);

  const loadCart = async () => {
    if (!user) {
      setItems([]);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('cart_items')
      .select(`
        id,
        service_id,
        quantity,
        details,
        service:services(*)
      `)
      .eq('user_id', user.id);

    if (!error && data) {
      setItems(data as any);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadCart();
  }, [user]);

  const addToCart = async (
    serviceId: string,
    serviceName: string,
    _categoryName: string,
    details: ServiceDetails,
    quantity: number = 1,
  ): Promise<AddToCartResult> => {
    if (!user) return { success: false };

    const normalized = normalizeDetails(serviceName, details);
    const limits = getQuantityLimits(serviceName);
    const clampedQty = limits.fixed ? 1 : Math.max(limits.min, Math.min(quantity, limits.max ?? Infinity));

    const existingItem = items.find(
      (item) =>
        item.service_id === serviceId &&
        detailsEqual(serviceName, item.details, normalized),
    );

    if (existingItem) {
      if (isFixedQuantity(serviceName)) {
        return { success: false, message: 'Esta configuración ya está en tu carrito' };
      }

      const newQuantity = existingItem.quantity + clampedQty;
      if (limits.max !== null && newQuantity > limits.max) {
        return {
          success: false,
          message: `No puedes agregar más de ${limits.max} unidades de este servicio`,
        };
      }

      const { error } = await supabase
        .from('cart_items')
        .update({ quantity: newQuantity })
        .eq('id', existingItem.id);

      if (error) return { success: false };
      await loadCart();
      return { success: true };
    }

    const { error } = await supabase
      .from('cart_items')
      .insert({
        user_id: user.id,
        service_id: serviceId,
        quantity: clampedQty,
        details: normalized,
      });

    if (error) return { success: false };
    await loadCart();
    return { success: true };
  };

  const updateQuantity = async (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      await removeFromCart(itemId);
      return;
    }

    const { error } = await supabase
      .from('cart_items')
      .update({ quantity })
      .eq('id', itemId);

    if (!error) {
      await loadCart();
    }
  };

  const updateItemDetails = async (
    itemId: string,
    serviceName: string,
    details: ServiceDetails,
  ) => {
    const normalized = normalizeDetails(serviceName, details);
    const { error } = await supabase
      .from('cart_items')
      .update({ details: normalized })
      .eq('id', itemId);

    if (!error) {
      await loadCart();
    }
  };

  const removeFromCart = async (itemId: string) => {
    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('id', itemId);

    if (!error) {
      await loadCart();
    }
  };

  const clearCart = async () => {
    if (!user) return;

    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('user_id', user.id);

    if (!error) {
      setItems([]);
    }
  };

  const totalAmount = items.reduce((sum, item) => sum + (item.service.price * item.quantity), 0);
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider value={{
      items,
      loading,
      addToCart,
      updateQuantity,
      updateItemDetails,
      removeFromCart,
      clearCart,
      totalAmount,
      totalItems,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}

export { detailsToKey };
