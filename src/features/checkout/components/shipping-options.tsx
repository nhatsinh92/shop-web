"use client";

import { RadioGroup } from "@/components/ui/radio-group";
import { formatVnd } from "@/lib/format";

import { OptionCard } from "./option-card";

import type { ShippingOption } from "../api";

/** Shipping option cards: name, delivery estimate and fee or "Miễn phí". */
export function ShippingOptions({
  options,
  value,
  onChange,
}: {
  options: readonly ShippingOption[];
  value: ShippingOption["id"] | undefined;
  onChange: (id: ShippingOption["id"]) => void;
}) {
  return (
    <RadioGroup
      aria-labelledby="ship-h"
      value={value ?? ""}
      onValueChange={(next) => {
        const picked = options.find((option) => option.id === next);
        if (picked) onChange(picked.id);
      }}
    >
      {options.map((option) => (
        <OptionCard
          key={option.id}
          id={`shipping-${option.id}`}
          value={option.id}
          title={option.name}
          description={option.estimatedDelivery}
          aside={option.fee.amount === 0 ? "Miễn phí" : formatVnd(option.fee.amount)}
        />
      ))}
    </RadioGroup>
  );
}
