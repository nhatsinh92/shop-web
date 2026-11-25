"use client";

import { RadioGroup } from "@/components/ui/radio-group";

import { OptionCard } from "./option-card";

import type { PaymentMethod } from "../api";

// Descriptions of the Checkout artboard; the contract carries only the name.
const DESCRIPTIONS: Record<PaymentMethod["id"], string> = {
  COD: "Trả tiền mặt khi nhận",
  EWALLET: "Chuyển sang ứng dụng ví để xác nhận",
  CARD: "Hỗ trợ trả góp 0%",
};

/** Payment method cards; a method that is not available is disabled with a reason. */
export function PaymentMethods({
  methods,
  value,
  onChange,
}: {
  methods: readonly PaymentMethod[];
  value: PaymentMethod["id"];
  onChange: (id: PaymentMethod["id"]) => void;
}) {
  return (
    <RadioGroup
      aria-labelledby="pay-h"
      value={value}
      onValueChange={(next) => {
        const picked = methods.find((method) => method.id === next && method.available);
        if (picked) onChange(picked.id);
      }}
    >
      {methods.map((method) => (
        <OptionCard
          key={method.id}
          id={`payment-${method.id}`}
          value={method.id}
          disabled={!method.available}
          title={method.name}
          description={method.available ? DESCRIPTIONS[method.id] : "Tạm thời không khả dụng"}
        />
      ))}
    </RadioGroup>
  );
}
