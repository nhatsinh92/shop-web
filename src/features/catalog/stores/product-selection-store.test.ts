import { describe, expect, it } from "vitest";

import { createProductSelectionStore } from "./product-selection-store";

describe("product selection store", () => {
  it("starts with the given SKU, quantity 1 and not disabled", () => {
    const { sku, quantity, disabled } = createProductSelectionStore("A").getState();
    expect({ sku, quantity, disabled }).toEqual({ sku: "A", quantity: 1, disabled: false });
  });

  it("clamps the quantity to 1–10", () => {
    const store = createProductSelectionStore("A");
    store.getState().decrement();
    expect(store.getState().quantity).toBe(1);
    store.getState().setQuantity(99);
    expect(store.getState().quantity).toBe(10);
    store.getState().increment();
    expect(store.getState().quantity).toBe(10);
    store.getState().setQuantity(Number.NaN);
    expect(store.getState().quantity).toBe(1);
    store.getState().setQuantity(3);
    store.getState().increment();
    store.getState().decrement();
    expect(store.getState().quantity).toBe(3);
  });

  it("re-enables when another variant is selected and keeps stores independent", () => {
    const one = createProductSelectionStore("A");
    const two = createProductSelectionStore("A");
    one.getState().setDisabled(true);
    expect(two.getState().disabled).toBe(false);
    one.getState().selectSku("B");
    expect(one.getState()).toMatchObject({ sku: "B", disabled: false });
  });
});
