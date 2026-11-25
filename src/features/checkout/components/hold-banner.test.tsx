import { act, render, screen } from "@testing-library/react";

import { HoldBanner } from "./hold-banner";

const NOW = new Date("2026-12-12T03:00:00Z").getTime();
const expiresIn = (ms: number) => new Date(NOW + ms).toISOString();

describe("HoldBanner", () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());

  it("shows the hold text starting at 10:00 for a new reservation", () => {
    render(<HoldBanner expiresAt={expiresIn(600_000)} />);
    expect(
      screen.getByText(/Sản phẩm đang được giữ cho bạn\. Hoàn tất trong/, { exact: false }),
    ).toHaveTextContent(
      "Sản phẩm đang được giữ cho bạn. Hoàn tất trong 10:00 để giữ giá flash sale.",
    );
  });

  it("computes the time from expiresAt each tick: 5 minutes at once shows 05:00", () => {
    render(<HoldBanner expiresAt={expiresIn(600_000)} />);
    act(() => vi.advanceTimersByTime(300_000));
    expect(screen.getByText("05:00")).toBeInTheDocument();
  });

  it("uses one setInterval per mount and clears it on unmount", () => {
    const spy = vi.spyOn(globalThis, "setInterval");
    const { unmount } = render(<HoldBanner expiresAt={expiresIn(600_000)} />);
    act(() => vi.advanceTimersByTime(5_000));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("switches the time to the accent colour under 60 s and keeps the countdown silent", () => {
    render(<HoldBanner expiresAt={expiresIn(70_000)} />);
    const time = screen.getByText("01:10");
    expect(time).toHaveAttribute("aria-live", "off");
    expect(time).not.toHaveClass("text-brand");
    act(() => vi.advanceTimersByTime(20_000));
    expect(screen.getByText("00:50")).toHaveClass("text-brand");
  });

  it("announces the last minute once in a polite live region", () => {
    render(<HoldBanner expiresAt={expiresIn(90_000)} />);
    const live = screen.getByRole("status");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toBeEmptyDOMElement();
    act(() => vi.advanceTimersByTime(30_000));
    expect(live).toHaveTextContent("Còn 1 phút để hoàn tất đơn hàng");
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getAllByText("Còn 1 phút để hoàn tất đơn hàng")).toHaveLength(1);
  });

  it("calls onExpire at 0", () => {
    const onExpire = vi.fn();
    render(<HoldBanner expiresAt={expiresIn(3_000)} onExpire={onExpire} />);
    expect(onExpire).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.getByText("00:00")).toBeInTheDocument();
    expect(onExpire).toHaveBeenCalled();
  });
});
