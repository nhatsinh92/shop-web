import { createStore } from "zustand/vanilla";

export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 10;

export interface ProductSelectionState {
  /** SKU of the selected variant. */
  sku: string;
  quantity: number;
  /** True while the selected SKU is out of stock; add to cart must not be offered. */
  disabled: boolean;
  selectSku: (sku: string) => void;
  setQuantity: (quantity: number) => void;
  increment: () => void;
  decrement: () => void;
  setDisabled: (disabled: boolean) => void;
}

function clamp(quantity: number): number {
  return Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, Math.trunc(quantity) || MIN_QUANTITY));
}

/**
 * UI selection of one product page. Created per page (see `ProductSelectionProvider`), never
 * global. It holds the user's choices only; prices and stock stay in the server-rendered price box.
 */
export function createProductSelectionStore(initialSku: string) {
  return createStore<ProductSelectionState>()((set) => ({
    sku: initialSku,
    quantity: MIN_QUANTITY,
    disabled: false,
    // A new variant starts enabled; its stock line sets `disabled` again once it renders.
    selectSku: (sku) => set({ sku, disabled: false }),
    setQuantity: (quantity) => set({ quantity: clamp(quantity) }),
    increment: () => set((state) => ({ quantity: clamp(state.quantity + 1) })),
    decrement: () => set((state) => ({ quantity: clamp(state.quantity - 1) })),
    setDisabled: (disabled) => set({ disabled }),
  }));
}

export type ProductSelectionStore = ReturnType<typeof createProductSelectionStore>;
