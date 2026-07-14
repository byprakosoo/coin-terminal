import { describe, expect, it } from "vitest";
import { backtestDefensiveStrategy } from "@/lib/btc-defensive-backtest";
import { buildDefensiveStrategyContext, evaluateDefensiveSignal, evaluateDefensiveSignalAt, type StrategyCandle } from "@/lib/btc-defensive-strategy";

function candles(length: number, reducer: (value: number, index: number) => number): StrategyCandle[] {
  let value = 20_000;
  return Array.from({ length }, (_, index) => {
    value = reducer(value, index);
    const date = new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10);
    return {
      date,
      open: String(value * 0.998),
      high: String(value * 1.01),
      low: String(value * 0.99),
      close: String(value),
      volume: "1000",
    };
  });
}

describe("BTC defensive strategy", () => {
  it("adds only one 10-point step after confirmed risk-on evidence", () => {
    const result = evaluateDefensiveSignal(candles(240, (value) => value * 1.003), {
      modelAllocationPct: "0",
    });
    expect(result.action).toBe("BUY");
    expect(result.targetAllocationPct).toBe("10.00");
    expect(result.deltaAllocationPct).toBe("10.00");
    expect(Number(result.agreementPct)).toBe(100);
  });

  it("uses the full-exit override for a severe daily loss", () => {
    const history = candles(220, (value, index) => index === 219 ? value * 0.85 : value * 1.002);
    const result = evaluateDefensiveSignal(history, {
      modelAllocationPct: "50",
      lastModelChangeDate: history[200].date,
    });
    expect(result.action).toBe("SELL");
    expect(result.targetAllocationPct).toBe("0.00");
    expect(result.hardExit).toBe(true);
    expect(result.recoveringFromHardExit).toBe(true);
  });

  it("never exceeds the 50% model allocation cap", () => {
    const result = evaluateDefensiveSignal(candles(240, (value) => value * 1.003), {
      modelAllocationPct: "50",
      lastModelChangeDate: "2020-01-01",
    });
    expect(result.targetAllocationPct).toBe("50.00");
    expect(result.action).toBe("WATCH");
  });

  it("produces a deterministic long/cash backtest with modeled costs", () => {
    const result = backtestDefensiveStrategy("fixture", candles(500, (value, index) =>
      index > 350 && index < 390 ? value * 0.985 : value * 1.002,
    ));
    expect(result.evaluatedDays).toBe(299);
    expect(result.costBps).toBe(25);
    expect(result.equity).toHaveLength(299);
    expect(Number(result.strategy.maxDrawdownPct)).toBeGreaterThanOrEqual(-20);
    expect(result.equity.every((point) => Number(point.targetAllocationPct) <= 50)).toBe(true);
  });

  it("does not let a future candle change an earlier decision", () => {
    const history = candles(260, (value, index) => index === 259 ? value * 0.7 : value * 1.002);
    const context = buildDefensiveStrategyContext(history);
    const earlier = evaluateDefensiveSignalAt(context, 258, { modelAllocationPct: "20" });
    const withoutFuture = evaluateDefensiveSignal(history.slice(0, 259), { modelAllocationPct: "20" });
    expect(earlier).toEqual(withoutFuture);
    expect(evaluateDefensiveSignalAt(context, 259, { modelAllocationPct: "20" }).hardExit).toBe(true);
  });

  it("trades only when the frozen target changes", () => {
    const result = backtestDefensiveStrategy("fixture", candles(500, (value) => value * 1.0015));
    expect(result.changes).toBeLessThan(result.evaluatedDays / 5);
    expect(result.changes).toBeGreaterThan(0);
  });
});
