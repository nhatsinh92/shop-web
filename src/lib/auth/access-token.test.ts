// @vitest-environment node
import { describe, expect, it } from "vitest";

import { isTokenExpiring, isTokenUsable, readTokenExpiry } from "./access-token";

function jwt(claims: object): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode(claims)}.signature`;
}

const NOW = 1_800_000_000_000;
const inSeconds = (s: number) => NOW / 1000 + s;

describe("readTokenExpiry", () => {
  it("reads exp from a base64url payload", () => {
    expect(readTokenExpiry(jwt({ exp: 1234, sub: "ü" }))).toBe(1234);
  });

  it.each([undefined, "", "abc", "a.b.c", "a.!!!.c", `a.${btoa("[]")}.c`])(
    "returns null for malformed token %s",
    (token) => {
      expect(readTokenExpiry(token)).toBeNull();
    },
  );

  it("returns null when exp is missing or not a number", () => {
    expect(readTokenExpiry(jwt({ sub: "1" }))).toBeNull();
    expect(readTokenExpiry(jwt({ exp: "soon" }))).toBeNull();
  });
});

describe("isTokenExpiring", () => {
  it("is false for a token valid for more than 60 seconds", () => {
    expect(isTokenExpiring(jwt({ exp: inSeconds(61) }), NOW)).toBe(false);
  });

  it("is true within 60 seconds, once expired, or when missing/malformed/without exp", () => {
    expect(isTokenExpiring(jwt({ exp: inSeconds(60) }), NOW)).toBe(true);
    expect(isTokenExpiring(jwt({ exp: inSeconds(-5) }), NOW)).toBe(true);
    expect(isTokenExpiring(undefined, NOW)).toBe(true);
    expect(isTokenExpiring("garbage", NOW)).toBe(true);
    expect(isTokenExpiring(jwt({}), NOW)).toBe(true);
  });
});

describe("isTokenUsable", () => {
  it("is true only while exp is in the future", () => {
    expect(isTokenUsable(jwt({ exp: inSeconds(10) }), NOW)).toBe(true);
    expect(isTokenUsable(jwt({ exp: inSeconds(-1) }), NOW)).toBe(false);
    expect(isTokenUsable(undefined, NOW)).toBe(false);
  });
});
