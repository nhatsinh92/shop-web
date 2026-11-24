"use client";

import { Minus, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

import type { CartLine } from "./cart-line-item";

export const MIN_QTY = 1;
export const MAX_QTY = 10;

const buttonClass =
  "flex size-touch items-center justify-center text-ink focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:text-stone-400";

/** "−" quantity "+" for one cart line; bounds 1–10, disabled on unavailable lines. */
export function QuantityStepper({
  line,
  onChange,
}: {
  line: CartLine;
  onChange: (quantity: number) => void;
}) {
  const locked = !line.available;
  return (
    <div
      className={cn(
        "flex items-center rounded-lg border border-stone-200",
        locked && "bg-stone-100",
      )}
    >
      <button
        type="button"
        className={buttonClass}
        aria-label={`Giảm số lượng ${line.name}`}
        disabled={locked || line.quantity <= MIN_QTY}
        onClick={() => onChange(line.quantity - 1)}
      >
        <Minus aria-hidden="true" className="size-4" />
      </button>
      <span className="min-w-8 text-center font-semibold tabular-nums" aria-live="off">
        {line.quantity}
      </span>
      <button
        type="button"
        className={buttonClass}
        aria-label={`Tăng số lượng ${line.name}`}
        disabled={locked || line.quantity >= MAX_QTY}
        onClick={() => onChange(line.quantity + 1)}
      >
        <Plus aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
