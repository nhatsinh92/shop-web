"use client";

import { useQuery } from "@tanstack/react-query";

import { authQueries } from "@/features/auth";
import { CheckoutView } from "@/features/checkout/client";

/** Composes the signed-in user's name with CheckoutView (features never import each other). */
export function CheckoutFormHost({ reservationId }: { reservationId: string }) {
  const me = useQuery({ ...authQueries.me(), retry: false });
  return <CheckoutView reservationId={reservationId} displayName={me.data?.displayName} />;
}
