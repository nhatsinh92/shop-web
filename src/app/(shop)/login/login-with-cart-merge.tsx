"use client";

import { useQueryClient } from "@tanstack/react-query";

import { LoginForm } from "@/features/auth";
import { mergeGuestCart } from "@/features/cart/client";

/** Composes auth and cart: after a successful login the guest cart is merged into the user cart. */
export function LoginWithCartMerge() {
  const queryClient = useQueryClient();
  return <LoginForm onLoggedIn={() => mergeGuestCart(queryClient)} />;
}
