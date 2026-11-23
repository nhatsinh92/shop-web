"use client";

import { useEffect, useState, type ReactNode } from "react";

interface FlashSaleCountdownProps {
  /** ISO timestamp the sale ends at. */
  endsAt: string;
  /** Right-hand header slot, for example the "Xem tất cả" link. */
  action: ReactNode;
  /** The product grid, rendered on the server and passed through as a slot. */
  children: ReactNode;
}

const SECOND = 1000;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Flash sale section frame with the countdown. The server renders a static label ("--:--:--");
 * the clock starts after mount, so `Date.now()` never runs during render (no hydration mismatch).
 * At zero the whole section is hidden.
 */
export function FlashSaleCountdown({ endsAt, action, children }: FlashSaleCountdownProps) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    const end = new Date(endsAt).getTime();
    const tick = () => setRemainingMs(Math.max(0, end - Date.now()));
    tick();
    const id = setInterval(tick, SECOND);
    return () => clearInterval(id);
  }, [endsAt]);

  if (remainingMs === 0) return null;

  const totalSeconds = remainingMs === null ? null : Math.ceil(remainingMs / SECOND);
  const parts =
    totalSeconds === null
      ? ["--", "--", "--"]
      : [
          pad(Math.floor(totalSeconds / 3600)),
          pad(Math.floor((totalSeconds % 3600) / 60)),
          pad(totalSeconds % 60),
        ];

  return (
    <section id="flash" aria-labelledby="flash-h" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <h2 id="flash-h" className="text-3xl font-extrabold tracking-[-0.02em]">
            Flash sale
          </h2>
          <div className="flex items-center gap-1.5 tabular-nums" role="timer">
            <span className="text-sm text-stone-600">Kết thúc sau</span>
            {parts.map((part, index) => (
              <span key={index} className="flex items-center gap-1.5">
                {index > 0 && <span aria-hidden="true">:</span>}
                <span className="rounded-md bg-ink px-2 py-1.5 font-bold text-white">{part}</span>
              </span>
            ))}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
