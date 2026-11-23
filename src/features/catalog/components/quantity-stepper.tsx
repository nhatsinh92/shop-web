import { Minus, Plus } from "lucide-react";

import { MAX_QUANTITY, MIN_QUANTITY } from "../stores/product-selection-store";

interface QuantityStepperProps {
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
}

const buttonClass =
  "inline-flex h-12 w-touch items-center justify-center bg-background focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40";

/** − / + buttons around the value, limited to 1–10 by the selection store. */
export function QuantityStepper({ value, onDecrement, onIncrement }: QuantityStepperProps) {
  return (
    <div className="flex items-center overflow-hidden rounded-xl border border-border">
      <button
        type="button"
        aria-label="Giảm số lượng"
        disabled={value <= MIN_QUANTITY}
        onClick={onDecrement}
        className={buttonClass}
      >
        <Minus aria-hidden="true" className="size-5" />
      </button>
      <span aria-live="polite" className="min-w-10 text-center font-bold tabular-nums">
        {value}
      </span>
      <button
        type="button"
        aria-label="Tăng số lượng"
        disabled={value >= MAX_QUANTITY}
        onClick={onIncrement}
        className={buttonClass}
      >
        <Plus aria-hidden="true" className="size-5" />
      </button>
    </div>
  );
}
