import { describe, expect, it } from "vitest";

import { ApiError } from "./api-error";
import { messageFor } from "./error-messages";

describe("error messages for contract 1.3.0", () => {
  it("maps CART_ITEMS_LIMIT to the 50 item message", () => {
    const error = new ApiError({ status: 422, code: "CART_ITEMS_LIMIT", detail: "Too many items" });
    expect(messageFor(error)).toBe("Giỏ hàng đã đủ 50 sản phẩm");
  });
});
