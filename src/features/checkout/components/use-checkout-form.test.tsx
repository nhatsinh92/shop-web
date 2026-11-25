import { act, renderHook } from "@testing-library/react";

import { useCheckoutForm } from "./use-checkout-form";

describe("useCheckoutForm mock outcome", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("exposes fail and timeout with the flag, undefined for success", () => {
    vi.stubEnv("NEXT_PUBLIC_MOCK_PAYMENT_CONTROLS", "1");
    const { result } = renderHook(() => useCheckoutForm({}));
    expect(result.current.mockOutcome).toBeUndefined();
    act(() => result.current.selectOutcome("fail"));
    expect(result.current.mockOutcome).toBe("fail");
    act(() => result.current.selectOutcome("timeout"));
    expect(result.current.mockOutcome).toBe("timeout");
  });

  it("is always undefined without the flag", () => {
    vi.stubEnv("NEXT_PUBLIC_MOCK_PAYMENT_CONTROLS", "");
    const { result } = renderHook(() => useCheckoutForm({}));
    act(() => result.current.selectOutcome("fail"));
    expect(result.current.mockOutcome).toBeUndefined();
  });
});
