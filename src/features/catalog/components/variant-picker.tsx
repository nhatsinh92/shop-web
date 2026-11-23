"use client";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export interface VariantOption {
  sku: string;
  /** Colour name shown on the swatch. */
  color: string;
}

interface VariantPickerProps {
  options: VariantOption[];
  value: string;
  onChange: (sku: string) => void;
}

/** Colour choice as a Radix radio group (arrow keys move and select). */
export function VariantPicker({ options, value, onChange }: VariantPickerProps) {
  const selected = options.find((option) => option.sku === value);
  return (
    <div className="flex flex-col gap-2.5">
      <span id="variant-label" className="text-sm font-semibold">
        Màu sắc: <span className="font-normal">{selected?.color}</span>
      </span>
      <RadioGroup
        aria-labelledby="variant-label"
        value={value}
        onValueChange={onChange}
        className="flex flex-wrap gap-2.5"
      >
        {options.map((option) => (
          <label
            key={option.sku}
            htmlFor={`variant-${option.sku}`}
            className="inline-flex min-h-touch w-auto cursor-pointer items-center gap-2 rounded-xl border border-border px-4 text-sm has-[[data-state=checked]]:border-2 has-[[data-state=checked]]:border-brand has-[[data-state=checked]]:bg-brand-tint"
          >
            <RadioGroupItem id={`variant-${option.sku}`} value={option.sku} />
            {option.color}
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}
