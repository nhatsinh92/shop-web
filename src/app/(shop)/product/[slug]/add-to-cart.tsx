"use client";

import { AddToCartButton } from "@/features/cart";
import { useProductSelection } from "@/features/catalog";

/** Composes catalog and cart: the selected SKU and quantity feed the add to cart button. */
export function AddToCart() {
  const { sku, quantity, disabled } = useProductSelection();
  return <AddToCartButton sku={sku} quantity={quantity} disabled={disabled} />;
}
