import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { notifySessionHintChanged, useSessionHint } from "./session-hint";

function clearCookie() {
  document.cookie = "logged_in=; Max-Age=0; path=/";
}

describe("useSessionHint", () => {
  afterEach(clearCookie);

  it("returns signed-in when logged_in=1", () => {
    document.cookie = "logged_in=1; path=/";
    const { result } = renderHook(() => useSessionHint());
    expect(result.current).toBe("signed-in");
  });

  it("returns guest when the cookie is absent", () => {
    const { result } = renderHook(() => useSessionHint());
    expect(result.current).toBe("guest");
  });

  it("returns unknown for the server snapshot", () => {
    function Probe() {
      return <span>{useSessionHint()}</span>;
    }
    expect(renderToString(<Probe />)).toContain("unknown");
  });

  it("updates after notifySessionHintChanged", () => {
    const { result } = renderHook(() => useSessionHint());
    expect(result.current).toBe("guest");
    document.cookie = "logged_in=1; path=/";
    act(() => notifySessionHintChanged());
    expect(result.current).toBe("signed-in");
  });
});
