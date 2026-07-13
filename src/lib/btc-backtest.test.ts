import { describe, expect, it } from "vitest";
import { backtestBtcSignal } from "@/lib/btc-backtest";

function closes(values: number[]) {
  return values.map((close, index) => {
    const date = new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10);
    return { date, close: String(close), observedAt: new Date(`${date}T23:59:59.999Z`) };
  });
}

describe("BTC signal backtest", () => {
  it("uses only next-close executions and returns reproducible metrics", () => {
    const series = closes(Array.from({ length: 120 }, (_, index) => 40_000 + index * 120));
    const result = backtestBtcSignal(series);

    expect(result.sourceDays).toBe(120);
    expect(result.evaluatedDays).toBe(69);
    expect(result.execution).toBe("NEXT_DAILY_CLOSE");
    expect(result.feeBps).toBe(10);
    expect(result.equity).toHaveLength(69);
    expect(result.buySignalDays + result.sellSignalDays + result.watchSignalDays).toBe(69);
    expect(Number(result.buyHoldReturnPct)).toBeGreaterThan(0);
    expect(Number(result.maxDrawdownPct)).toBeLessThanOrEqual(0);
  });

  it("rejects a history too short for indicators and forward evaluation", () => {
    expect(() => backtestBtcSignal(closes(Array.from({ length: 59 }, (_, index) => index + 1))))
      .toThrow("At least 60 daily closes");
  });
});
