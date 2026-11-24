import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { useCartSelectionStore } from "../stores/cart-selection-store";
import { LineSelectCheckbox } from "./line-select-checkbox";

beforeEach(() => useCartSelectionStore.setState({ selected: [], known: [] }));

describe("LineSelectCheckbox", () => {
  it("is labelled 'Chọn {name}', checked by default, in a 44 px target", async () => {
    render(<LineSelectCheckbox sku="A" name="Tai nghe" />);
    const box = screen.getByRole("checkbox", { name: "Chọn Tai nghe" });
    expect(box).toBeChecked();
    expect(box.parentElement).toHaveClass("size-touch");
    await userEvent.click(box);
    expect(box).not.toBeChecked();
    expect(useCartSelectionStore.getState().selected).toEqual([]);
  });
});
