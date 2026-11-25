import { ApiError } from "@/lib/api";

import type { ShippingAddressValues } from "./checkout.schema";

type FieldName = keyof ShippingAddressValues;

const FIELDS: ReadonlySet<string> = new Set<FieldName>([
  "fullName",
  "phone",
  "line1",
  "ward",
  "district",
  "province",
  "note",
]);

const PREFIX = "shippingAddress.";

/** Shown under a field the server rejected; the server text is not localised. */
export const FIELD_ERROR_MESSAGE = "Thông tin này chưa hợp lệ. Vui lòng kiểm tra lại.";

/** The form field of a contract path: `shippingAddress.phone` → `phone`; unknown paths → null. */
export function formFieldFor(path: string): FieldName | null {
  const name = path.startsWith(PREFIX) ? path.slice(PREFIX.length) : path;
  return FIELDS.has(name) ? (name as FieldName) : null;
}

/** The form fields named by a 400 `VALIDATION_FAILED`, in server order, without duplicates. */
export function fieldsFromError(error: ApiError): FieldName[] {
  const names: FieldName[] = [];
  for (const { field } of error.errors ?? []) {
    const name = formFieldFor(field);
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

const is = (error: unknown, status: number, code?: string): error is ApiError =>
  error instanceof ApiError &&
  error.status === status &&
  (code === undefined || error.code === code);

export const isValidationFailed = (error: unknown): error is ApiError =>
  is(error, 400, "VALIDATION_FAILED");
export const isReservationExpired = (error: unknown) =>
  is(error, 410, "CHECKOUT_RESERVATION_EXPIRED");
export const isReservationConsumed = (error: unknown) =>
  is(error, 410, "CHECKOUT_RESERVATION_CONSUMED");
export const isMethodUnavailable = (error: unknown) =>
  is(error, 422, "CHECKOUT_PAYMENT_METHOD_UNAVAILABLE");
export const isKeyReused = (error: unknown) => is(error, 422, "IDEMPOTENCY_KEY_REUSED");
/** 429 and 503 are shown as a toast, not inline. */
export const isBusy = (error: unknown): error is ApiError =>
  error instanceof ApiError && (error.status === 429 || error.status === 503);
