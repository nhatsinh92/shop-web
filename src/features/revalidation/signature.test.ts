// @vitest-environment node
import { describe, expect, it } from "vitest";

import { computeSignature, verifySignature } from "./signature";

const SECRET = "s3cret";
const BODY = '{"tags":["products"]}';
const NOW = 1_764_000_000;

function header(t: number, body = BODY, secret = SECRET) {
  return `t=${t},v1=${computeSignature(secret, t, body)}`;
}

describe("verifySignature", () => {
  it("accepts a valid signature", () => {
    expect(verifySignature(header(NOW), BODY, SECRET, NOW)).toBe(true);
  });
  it("rejects a wrong secret", () => {
    expect(verifySignature(header(NOW, BODY, "other"), BODY, SECRET, NOW)).toBe(false);
  });
  it("rejects a tampered body", () => {
    expect(verifySignature(header(NOW), '{"tags":["flash-sale"]}', SECRET, NOW)).toBe(false);
  });
  it("rejects a missing header", () => {
    expect(verifySignature(null, BODY, SECRET, NOW)).toBe(false);
  });
  it.each(["garbage", `t=${NOW}`, `t=${NOW},v1=abc`, `v1=${"a".repeat(64)},t=${NOW}`])(
    "rejects the malformed header %s",
    (value) => {
      expect(verifySignature(value, BODY, SECRET, NOW)).toBe(false);
    },
  );
  it("rejects t 301 s old and accepts 300 s", () => {
    expect(verifySignature(header(NOW - 301), BODY, SECRET, NOW)).toBe(false);
    expect(verifySignature(header(NOW - 300), BODY, SECRET, NOW)).toBe(true);
  });
  it("rejects t 301 s in the future", () => {
    expect(verifySignature(header(NOW + 301), BODY, SECRET, NOW)).toBe(false);
  });
  it("uses the current time by default", () => {
    const t = Math.floor(Date.now() / 1000);
    expect(verifySignature(header(t), BODY, SECRET)).toBe(true);
  });
});
