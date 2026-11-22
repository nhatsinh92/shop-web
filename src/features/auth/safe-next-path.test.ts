import { safeNextPath } from "./safe-next-path";

describe("safeNextPath", () => {
  it.each(["/account", "/checkout?step=1", "/a/b?x=1#h"])("keeps %s", (value) => {
    expect(safeNextPath(value)).toBe(value);
  });

  it.each([
    null,
    undefined,
    "",
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    "javascript:alert(1)",
    "%2F%2Fevil.example",
    "/\t/evil.example",
    "account",
  ])("falls back to / for %s", (value) => {
    expect(safeNextPath(value)).toBe("/");
  });
});
