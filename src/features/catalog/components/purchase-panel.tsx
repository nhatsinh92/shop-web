"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useStore } from "zustand";

import {
  createProductSelectionStore,
  type ProductSelectionStore,
} from "../stores/product-selection-store";
import { ProductGallery } from "./product-gallery";
import { QuantityStepper } from "./quantity-stepper";
import { VariantPicker, type VariantOption } from "./variant-picker";

const SelectionContext = createContext<ProductSelectionStore | null>(null);

function useSelectionStore(): ProductSelectionStore {
  const store = useContext(SelectionContext);
  if (!store) throw new Error("ProductSelectionProvider is missing above this component");
  return store;
}

/** Creates the selection store once per page render tree (never a module-level global). */
export function ProductSelectionProvider({
  initialSku,
  children,
}: {
  initialSku: string;
  children: ReactNode;
}) {
  const [store] = useState(() => createProductSelectionStore(initialSku));
  return <SelectionContext value={store}>{children}</SelectionContext>;
}

/** What the add to cart button needs: the selected SKU, the quantity and whether to disable. */
export function useProductSelection(): { sku: string; quantity: number; disabled: boolean } {
  const store = useSelectionStore();
  const sku = useStore(store, (state) => state.sku);
  const quantity = useStore(store, (state) => state.quantity);
  const disabled = useStore(store, (state) => state.disabled);
  return { sku, quantity, disabled };
}

/** Mounted by the price box of the selected SKU; tells the selection it is out of stock. */
export function StockSync({ outOfStock }: { outOfStock: boolean }) {
  const store = useSelectionStore();
  useEffect(() => {
    store.getState().setDisabled(outOfStock);
  }, [store, outOfStock]);
  return null;
}

interface SelectedGalleryProps {
  images: { url: string; alt: string }[];
  /** Colour name per variant SKU; the gallery alt text follows the selected variant. */
  colorBySku: Record<string, string>;
  fallbackName: string;
}

export function SelectedGallery({ images, colorBySku, fallbackName }: SelectedGalleryProps) {
  const { sku } = useProductSelection();
  return <ProductGallery images={images} colorName={colorBySku[sku] ?? fallbackName} />;
}

interface PurchasePanelProps {
  variants: VariantOption[];
  /** Server-rendered price box per variant SKU (each in its own Suspense); the selected one shows. */
  priceBoxes: Record<string, ReactNode>;
  /** Rendered under the stepper (the add to cart button, #60). */
  addToCartSlot?: ReactNode;
}

/** Price box of the selected variant, colour picker and quantity stepper. */
export function PurchasePanel({ variants, priceBoxes, addToCartSlot }: PurchasePanelProps) {
  const store = useSelectionStore();
  const { sku, quantity } = useProductSelection();
  const { selectSku, increment, decrement } = store.getState();

  return (
    <div className="flex flex-col gap-6">
      {priceBoxes[sku]}
      {variants.length > 0 && <VariantPicker options={variants} value={sku} onChange={selectSku} />}
      <QuantityStepper value={quantity} onDecrement={decrement} onIncrement={increment} />
      {addToCartSlot}
    </div>
  );
}
