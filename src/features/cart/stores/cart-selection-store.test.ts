import { beforeEach, describe, expect, it } from "vitest";

import {
  CART_SELECTION_STORAGE_KEY,
  hydrateCartSelection,
  isLineSelected,
  resetCartSelectionHydration,
  useCartSelectionStore,
} from "./cart-selection-store";

beforeEach(() => {
  sessionStorage.clear();
  resetCartSelectionHydration();
  useCartSelectionStore.setState({ selected: [], known: [] });
});

describe("cart selection store", () => {
  it("holds SKUs only and persists them to sessionStorage", () => {
    useCartSelectionStore.getState().setSelected("A", false);
    useCartSelectionStore.getState().setSelected("B", true);
    const saved = JSON.parse(sessionStorage.getItem(CART_SELECTION_STORAGE_KEY) ?? "{}");
    expect(saved.state).toEqual({ selected: ["B"], known: ["A", "B"] });
  });

  it("keeps the selection after a reload", () => {
    useCartSelectionStore.getState().setSelected("A", false);
    const saved = sessionStorage.getItem(CART_SELECTION_STORAGE_KEY) ?? "";
    useCartSelectionStore.setState({ selected: [], known: [] }); // a fresh page, same tab
    sessionStorage.setItem(CART_SELECTION_STORAGE_KEY, saved);
    hydrateCartSelection();
    expect(isLineSelected(useCartSelectionStore.getState(), "A")).toBe(false);
  });

  it("checks every line by default and lines that appear later", () => {
    const state = useCartSelectionStore.getState();
    expect(isLineSelected(state, "A")).toBe(true);
    state.sync(["A"]);
    state.setSelected("A", false);
    expect(isLineSelected(useCartSelectionStore.getState(), "NEW")).toBe(true);
  });

  it("sync checks lines it has not seen and keeps unchecked ones unchecked", () => {
    useCartSelectionStore.getState().setSelected("A", false);
    useCartSelectionStore.getState().sync(["A", "B"]);
    const state = useCartSelectionStore.getState();
    expect(isLineSelected(state, "A")).toBe(false);
    expect(state.selected).toEqual(["B"]);
  });

  it("forgets lines that left the cart, so a re-added line is checked", () => {
    const store = useCartSelectionStore.getState();
    store.setSelected("A", false);
    useCartSelectionStore.getState().sync(["B"]);
    expect(isLineSelected(useCartSelectionStore.getState(), "A")).toBe(true);
  });
});
