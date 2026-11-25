"use client";

import { RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

/** One option card of a RadioGroup: min 56 px, selected `border-brand` with the accent tint. */
export function OptionCard({
  id,
  value,
  disabled,
  title,
  description,
  aside,
}: {
  id: string;
  value: string;
  disabled?: boolean;
  title: string;
  description: string;
  aside?: string;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-14 cursor-pointer items-center gap-3.5 rounded-xl border border-stone-300 bg-white px-4 py-3",
        "has-[[role=radio][aria-checked=true]]:border-2 has-[[role=radio][aria-checked=true]]:border-brand has-[[role=radio][aria-checked=true]]:bg-brand-tint",
        "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-brand/50",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <RadioGroupItem id={id} value={value} disabled={disabled} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold text-ink">{title}</span>
        <span className="text-sm text-stone-600">{description}</span>
      </span>
      {aside ? (
        <span className="shrink-0 text-sm font-semibold text-ink tabular-nums">{aside}</span>
      ) : null}
    </label>
  );
}
