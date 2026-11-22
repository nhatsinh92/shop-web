import { describe, expect, it } from "vitest";

import { ApiError } from "./api-error";
import { messageFor } from "./error-messages";

describe("error messages added in contract 1.0.0", () => {
  it.each([
    ["ORDER_NOT_FOUND", "Không tìm thấy đơn hàng này."],
    ["IDEMPOTENCY_IN_PROGRESS", "Yêu cầu đang được xử lý. Vui lòng đợi trong giây lát."],
  ])("maps %s to its Vietnamese message", (code, message) => {
    expect(messageFor(new ApiError({ status: 409, code, detail: code }))).toBe(message);
  });
});
