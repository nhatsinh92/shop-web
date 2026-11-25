"use client";

import type { MockPaymentOutcome } from "../api";

export type MockOutcomeChoice = "success" | MockPaymentOutcome;

const CHOICES: ReadonlyArray<{ value: MockOutcomeChoice; label: string }> = [
  { value: "success", label: "Thành công" },
  { value: "fail", label: "Thất bại" },
  { value: "timeout", label: "Quá thời gian" },
];

/** Demo controls exist only in builds made with `NEXT_PUBLIC_MOCK_PAYMENT_CONTROLS=1`. */
export function mockControlsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MOCK_PAYMENT_CONTROLS === "1";
}

/** The header value for a choice; the default ("success") sends no header. */
export function mockOutcomeFor(choice: MockOutcomeChoice): MockPaymentOutcome | undefined {
  return choice === "success" ? undefined : choice;
}

/** Demo-only select of the mock payment outcome (native `<select>`, styled with tokens). */
export function MockOutcomeSelect({
  value,
  onChange,
}: {
  value: MockOutcomeChoice;
  onChange: (value: MockOutcomeChoice) => void;
}) {
  if (!mockControlsEnabled()) return null;
  return (
    <div className="flex flex-col gap-2 border-t border-stone-200 pt-3">
      <label htmlFor="mock-outcome" className="text-sm font-medium text-ink">
        Kết quả thanh toán (demo)
      </label>
      <select
        id="mock-outcome"
        value={value}
        onChange={(event) => onChange(event.target.value as MockOutcomeChoice)}
        className="h-touch rounded-lg border border-stone-300 bg-white px-3 text-sm text-ink outline-none focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/50"
      >
        {CHOICES.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </div>
  );
}
