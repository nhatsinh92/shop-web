"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { shippingAddressSchema } from "../checkout.schema";
import { mockOutcomeFor, mockControlsEnabled } from "./mock-outcome-select";

import type { MockOutcomeChoice } from "./mock-outcome-select";
import type { PaymentMethod, ShippingOption } from "../api";
import type { ShippingAddressValues } from "../checkout.schema";

const DEFAULT_PAYMENT: PaymentMethod["id"] = "COD";

/**
 * State of the checkout form: the address in React Hook Form (never persisted), the selected
 * shipping option and payment method, and the demo payment outcome. The view stays mounted when
 * the reservation is replaced, so everything here survives a new reservation id.
 */
export function useCheckoutForm({
  displayName,
  shippingOptions,
  paymentMethods,
}: {
  displayName?: string;
  shippingOptions?: readonly ShippingOption[];
  paymentMethods?: readonly PaymentMethod[];
}) {
  const form = useForm<ShippingAddressValues>({
    resolver: zodResolver(shippingAddressSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      line1: "",
      ward: "",
      district: "",
      province: "",
      note: "",
    },
  });
  const { getValues, setValue } = form;

  // Prefill the name once it arrives, never over something the user already typed.
  useEffect(() => {
    if (displayName && getValues("fullName") === "") setValue("fullName", displayName);
  }, [displayName, getValues, setValue]);

  const [pickedShipping, setPickedShipping] = useState<ShippingOption["id"] | null>(null);
  const [pickedPayment, setPickedPayment] = useState<PaymentMethod["id"]>(DEFAULT_PAYMENT);
  const [outcomeChoice, setOutcomeChoice] = useState<MockOutcomeChoice>("success");

  // The first option is the default; a pick that is no longer offered falls back to it.
  const shipping =
    shippingOptions?.find((option) => option.id === pickedShipping) ?? shippingOptions?.[0];
  const payment = paymentMethods?.find((method) => method.id === pickedPayment);
  const paymentMethodId = payment && !payment.available ? DEFAULT_PAYMENT : pickedPayment;

  return {
    form,
    shippingOptionId: shipping?.id,
    shippingFee: shipping?.fee.amount,
    selectShipping: setPickedShipping,
    paymentMethodId,
    selectPayment: setPickedPayment,
    outcomeChoice,
    selectOutcome: setOutcomeChoice,
    /** The `X-Mock-Payment-Outcome` value for the place-order call; always undefined without the flag. */
    mockOutcome: mockControlsEnabled() ? mockOutcomeFor(outcomeChoice) : undefined,
  };
}
