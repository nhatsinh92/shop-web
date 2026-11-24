"use client";

import { Trash2 } from "lucide-react";

import type { CartLine } from "./cart-line-item";

/** Trash button of a cart line; stays enabled on unavailable lines. */
export function RemoveLineButton({ line, onRemove }: { line: CartLine; onRemove: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Xóa ${line.name}`}
      onClick={onRemove}
      className="flex size-touch items-center justify-center rounded-lg text-stone-600 hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Trash2 aria-hidden="true" className="size-5" />
    </button>
  );
}
