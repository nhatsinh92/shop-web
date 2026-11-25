import { act, render, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { clearCartCount, readCartCount, useCartCountHint, writeCartCount } from "./cart-count";

function wipeCookie() {
  document.cookie = "cart_count=; Max-Age=0; Path=/";
}

function stubProtocol(protocol: string) {
  vi.stubGlobal("location", { ...window.location, protocol });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  wipeCookie();
});

describe("writeCartCount", () => {
  it("sets the cookie attributes without Secure on http", () => {
    stubProtocol("http:");
    const setter = vi.spyOn(document, "cookie", "set");
    writeCartCount(3);
    expect(setter).toHaveBeenCalledWith("cart_count=3; Path=/; Max-Age=2592000; SameSite=Lax");
  });

  it("adds Secure on https", () => {
    stubProtocol("https:");
    const setter = vi.spyOn(document, "cookie", "set");
    writeCartCount(12);
    expect(setter).toHaveBeenCalledWith(
      "cart_count=12; Path=/; Max-Age=2592000; SameSite=Lax; Secure",
    );
  });

  it.each([1.5, -1, 1000, Number.NaN, Infinity])("writes nothing for %s", (value) => {
    const setter = vi.spyOn(document, "cookie", "set");
    writeCartCount(value);
    expect(setter).not.toHaveBeenCalled();
  });

  it("accepts the bounds 0 and 999", () => {
    writeCartCount(0);
    expect(readCartCount()).toBe(0);
    writeCartCount(999);
    expect(readCartCount()).toBe(999);
  });
});

describe("readCartCount", () => {
  it.each([
    ["cart_count=0", 0],
    ["cart_count=7", 7],
    ["cart_count=999", 999],
    ["a=1; cart_count=42; b=2", 42],
    ["", null],
    ["other=5", null],
    ["cart_count=abc", null],
    ["cart_count=-1", null],
    ["cart_count=1000", null],
    ["cart_count=1.5", null],
    ["cart_count=", null],
    ["cart_count", null],
  ])("reads %j as %s", (cookie, expected) => {
    document.cookie = "cart_count=; Max-Age=0; Path=/";
    vi.spyOn(document, "cookie", "get").mockReturnValue(cookie);
    expect(readCartCount()).toBe(expected);
  });
});

describe("clearCartCount", () => {
  it("expires the cookie so readCartCount returns null", () => {
    writeCartCount(5);
    expect(readCartCount()).toBe(5);
    clearCartCount();
    expect(readCartCount()).toBeNull();
  });

  it("sets the expected cookie string", () => {
    const setter = vi.spyOn(document, "cookie", "set");
    clearCartCount();
    expect(setter).toHaveBeenCalledWith("cart_count=; Max-Age=0; Path=/");
  });
});

function Probe() {
  const count = useCartCountHint();
  return <p data-testid="hint">{count === null ? "none" : String(count)}</p>;
}

describe("useCartCountHint", () => {
  it("re-renders mounted subscribers on write and clear", () => {
    render(<Probe />);
    expect(screen.getByTestId("hint").textContent).toBe("none");
    act(() => writeCartCount(4));
    expect(screen.getByTestId("hint").textContent).toBe("4");
    act(() => clearCartCount());
    expect(screen.getByTestId("hint").textContent).toBe("none");
  });

  it("renders null on the server snapshot and hydrates without a warning", async () => {
    writeCartCount(9);
    const html = renderToString(<Probe />);
    expect(html).toContain("none");

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, <Probe />);
    });
    expect(errors).not.toHaveBeenCalled();
    expect(container.textContent).toBe("9");
    act(() => root?.unmount());
    container.remove();
  });
});
