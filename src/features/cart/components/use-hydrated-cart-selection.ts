"use client";

import { useEffect } from "react";

import { hydrateCartSelection } from "../stores/cart-selection-store";

/** Loads the saved selection after mount, so the first client render matches the server HTML. */
export function useHydratedCartSelection(): void {
  useEffect(() => {
    hydrateCartSelection();
  }, []);
}
