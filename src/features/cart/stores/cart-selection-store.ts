import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const CART_SELECTION_STORAGE_KEY = "cart-selection";

interface CartSelectionState {
  /** SKUs the shopper has checked explicitly. */
  selected: string[];
  /** SKUs the shopper has already seen; a SKU outside this list is new and counts as checked. */
  known: string[];
  /** Checks or unchecks one line. */
  setSelected: (sku: string, checked: boolean) => void;
  /** Aligns the store with the SKUs now in the cart: new lines are checked, gone lines forgotten. */
  sync: (skus: readonly string[]) => void;
}

/**
 * UI state only: which cart lines are checked. It holds SKUs and nothing else (no prices, names or
 * other server data), persisted in `sessionStorage` so a reload in the same tab keeps it. Hydration
 * is manual (`hydrateCartSelection`) so server and first client render agree.
 */
export const useCartSelectionStore = create<CartSelectionState>()(
  persist(
    (set) => ({
      selected: [],
      known: [],
      setSelected: (sku, checked) =>
        set((state) => ({
          selected: checked
            ? [...state.selected.filter((s) => s !== sku), sku]
            : state.selected.filter((s) => s !== sku),
          known: state.known.includes(sku) ? state.known : [...state.known, sku],
        })),
      sync: (skus) =>
        set((state) => ({
          selected: skus.filter((s) =>
            state.known.includes(s) ? state.selected.includes(s) : true,
          ),
          known: [...skus],
        })),
    }),
    {
      name: CART_SELECTION_STORAGE_KEY,
      storage: createJSONStorage(() => sessionStorage),
      skipHydration: true,
      partialize: ({ selected, known }) => ({ selected, known }),
    },
  ),
);

let hydrated = false;

/** Reads the saved selection from sessionStorage into the store, once per page load. */
export function hydrateCartSelection(): void {
  if (hydrated) return;
  hydrated = true;
  void useCartSelectionStore.persist.rehydrate();
}

/** Test helper: lets the next `hydrateCartSelection` read storage again. */
export function resetCartSelectionHydration(): void {
  hydrated = false;
}

/** A line is checked unless the shopper has seen it and left it unchecked. */
export function isLineSelected(state: Pick<CartSelectionState, "selected" | "known">, sku: string) {
  return !state.known.includes(sku) || state.selected.includes(sku);
}
