import { ApiError } from "./api-error";

export const GENERIC_ERROR_MESSAGE = "Đã có lỗi xảy ra. Vui lòng thử lại.";

/** User-facing Vietnamese copy per error `code` (contract catalogue plus client-side codes). */
export const errorMessages: Record<string, string> = {
  VALIDATION_FAILED: "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.",
  AUTH_UNAUTHENTICATED: "Vui lòng đăng nhập để tiếp tục.",
  AUTH_INVALID_CREDENTIALS: "Email hoặc mật khẩu không đúng.",
  AUTH_REFRESH_INVALID: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  AUTH_FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
  NOT_FOUND: "Không tìm thấy nội dung bạn cần.",
  PRODUCT_NOT_FOUND: "Không tìm thấy sản phẩm này.",
  FLASH_SALE_NONE: "Hiện chưa có chương trình flash sale nào.",
  CHECKOUT_OUT_OF_STOCK: "Một số sản phẩm đã hết hàng. Vui lòng kiểm tra lại giỏ hàng.",
  CHECKOUT_RESERVATION_NOT_FOUND: "Không tìm thấy đơn giữ hàng. Vui lòng thử lại.",
  CHECKOUT_RESERVATION_EXPIRED: "Đơn giữ hàng đã hết hạn. Vui lòng đặt lại.",
  PAGINATION_CURSOR_INVALID: "Danh sách đã thay đổi. Vui lòng tải lại trang.",
  CART_ITEM_NOT_FOUND: "Sản phẩm này không còn trong giỏ hàng.",
  CART_OUT_OF_STOCK: "Sản phẩm không đủ số lượng trong kho.",
  CART_QTY_LIMIT: "Bạn đã đạt số lượng tối đa cho sản phẩm này.",
  CONFLICT: "Dữ liệu vừa được cập nhật. Vui lòng thử lại.",
  IDEMPOTENCY_KEY_MISSING: "Yêu cầu chưa hợp lệ. Vui lòng thử lại.",
  IDEMPOTENCY_KEY_REUSED: "Yêu cầu này đã được gửi trước đó. Vui lòng tải lại trang.",
  UNPROCESSABLE_ENTITY: "Không thể xử lý yêu cầu. Vui lòng kiểm tra lại thông tin.",
  RATE_LIMITED: "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.",
  INTERNAL_ERROR: GENERIC_ERROR_MESSAGE,
  SERVICE_UNAVAILABLE: "Hệ thống đang quá tải. Vui lòng thử lại sau.",
  NETWORK_ERROR: "Không thể kết nối. Vui lòng kiểm tra kết nối mạng và thử lại.",
  UNKNOWN_ERROR: GENERIC_ERROR_MESSAGE,
};

/** Vietnamese message for any thrown value; unknown codes and non-ApiErrors get the generic text. */
export function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    return Object.hasOwn(errorMessages, error.code)
      ? (errorMessages[error.code] as string)
      : GENERIC_ERROR_MESSAGE;
  }
  return GENERIC_ERROR_MESSAGE;
}
