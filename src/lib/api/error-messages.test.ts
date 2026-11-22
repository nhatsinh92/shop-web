import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

import { ApiError } from "./api-error";
import { errorMessages, messageFor } from "./error-messages";

const GENERIC = "Đã có lỗi xảy ra. Vui lòng thử lại.";
const CLIENT_CODES = ["NETWORK_ERROR", "UNKNOWN_ERROR"];

const catalogue = Object.keys(
  (
    parse(readFileSync("node_modules/@shop/api-contract/openapi/errors.yaml", "utf8")) as Record<
      string,
      Record<string, unknown>
    >
  )["x-error-codes"] ?? {},
);

function apiError(code: string, status = 400): ApiError {
  return new ApiError({ status, code, detail: "x" });
}

describe("errorMessages", () => {
  it("reads a non-empty catalogue", () => {
    expect(catalogue.length).toBeGreaterThan(0);
  });

  it("every catalogued code has a message", () => {
    const missing = catalogue.filter((code) => !(code in errorMessages));
    expect(missing, `codes without a message: ${missing.join(", ")}`).toEqual([]);
  });

  it("no stale messages", () => {
    const stale = Object.keys(errorMessages).filter(
      (code) => !catalogue.includes(code) && !CLIENT_CODES.includes(code),
    );
    expect(stale, `messages for unknown codes: ${stale.join(", ")}`).toEqual([]);
  });

  it("no message contains the raw code, an HTTP status number or English text", () => {
    for (const [code, message] of Object.entries(errorMessages)) {
      expect(message, code).not.toContain(code);
      expect(message, code).not.toMatch(/\d{3}/);
      expect(message, code).not.toMatch(/\b(error|please|try again|failed|invalid|server)\b/i);
      expect(message, code).toMatch(/[ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯưẠ-ỹ]/);
    }
  });
});

describe("messageFor", () => {
  it("returns the mapped message for an ApiError with a known code", () => {
    expect(messageFor(apiError("NOT_FOUND", 404))).toBe(errorMessages["NOT_FOUND"]);
  });

  it("returns the generic message for an unknown code", () => {
    expect(messageFor(apiError("SOMETHING_NEW"))).toBe(GENERIC);
  });

  it("does not resolve inherited object keys as codes", () => {
    expect(messageFor(apiError("constructor"))).toBe(GENERIC);
  });

  it("returns the generic message for a non-ApiError error", () => {
    expect(messageFor(new Error("boom"))).toBe(GENERIC);
  });

  it("returns the generic message for a non-error value", () => {
    expect(messageFor("boom")).toBe(GENERIC);
    expect(messageFor(undefined)).toBe(GENERIC);
  });

  it("tells the user to retry later for RATE_LIMITED and SERVICE_UNAVAILABLE", () => {
    expect(messageFor(apiError("RATE_LIMITED", 429))).toContain("thử lại sau");
    expect(messageFor(apiError("SERVICE_UNAVAILABLE", 503))).toContain("thử lại sau");
  });

  it("mentions the connection for NETWORK_ERROR", () => {
    expect(messageFor(apiError("NETWORK_ERROR", 0))).toContain("kết nối");
  });
});
