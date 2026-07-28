import type { Product, ProductVariant } from "@pocket/domain";
import { create } from "zustand";

export interface CartItem {
  variant: ProductVariant;
  product: Product;
  quantity: number;
  unitPrice: number;
  discount: number;
}

interface CartState {
  items: CartItem[];
  customerId?: string;
  addItem: (variant: ProductVariant, product: Product) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  updatePrice: (variantId: string, price: number) => void;
  removeItem: (variantId: string) => void;
  setCustomerId: (customerId?: string) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>((set) => ({
  items: [],
  addItem: (variant, product) =>
    set((state) => {
      const existing = state.items.find((item) => item.variant.id === variant.id);
      return {
        items: existing
          ? state.items.map((item) =>
              item.variant.id === variant.id ? { ...item, quantity: item.quantity + 1 } : item,
            )
          : [
              ...state.items,
              { variant, product, quantity: 1, unitPrice: variant.salePrice, discount: 0 },
            ],
      };
    }),
  updateQuantity: (variantId, quantity) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.variant.id === variantId ? { ...item, quantity: Math.max(1, quantity) } : item,
      ),
    })),
  updatePrice: (variantId, price) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.variant.id === variantId
          ? { ...item, unitPrice: Math.max(0, Math.round(price)) }
          : item,
      ),
    })),
  removeItem: (variantId) =>
    set((state) => ({ items: state.items.filter((item) => item.variant.id !== variantId) })),
  setCustomerId: (customerId) => set({ customerId }),
  clear: () => set({ items: [], customerId: undefined }),
}));
