"use client";

import { Checkbox } from "@/components/ui/checkbox";

import { isLineSelected, useCartSelectionStore } from "../stores/cart-selection-store";

/** Checkbox that includes a cart line in the summary; the 44 px target wraps the control. */
export function LineSelectCheckbox({ sku, name }: { sku: string; name: string }) {
  const checked = useCartSelectionStore((state) => isLineSelected(state, sku));
  const setSelected = useCartSelectionStore((state) => state.setSelected);
  return (
    <span className="flex size-touch flex-none items-center justify-center">
      <Checkbox
        aria-label={`Chọn ${name}`}
        checked={checked}
        onCheckedChange={(value) => setSelected(sku, value === true)}
      />
    </span>
  );
}
