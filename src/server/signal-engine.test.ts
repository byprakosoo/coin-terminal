import { describe, expect, it } from "vitest";
import { generateBtcSignal, type DailyClose } from "@/server/signal-engine";

function series(
  reducer: (price: number, index: number) => number,
  observedAt = new Date("2026-07-09T23:59:59.999Z"),
): DailyClose[] {
  let price = 50_000;
  return Array.from({ length: 60 }, (_, index) => {
    price = reducer(price, index);
    const date = new Date(Date.UTC(2026, 4, 11 + index)).toISOString().slice(0, 10);
    return { date, close: price.toFixed(8), observedAt };
  });
}

describe("generateBtcSignal", () => {
  it("emits BUY when fresh weighted evidence exceeds the threshold", () => {
    const result = generateBtcSignal(series((price) => price * 1.012), {
      now: new Date("2026-07-10T00:10:00.000Z"),
      walletContextScore: "100",
    });
    expect(result.action).toBe("BUY");
    expect(Number(result.compositeScore)).toBeGreaterThanOrEqual(70);
    expect(result.evidence).toHaveLength(5);
  });

  it("emits SELL for fresh, volatile downward evidence when the configured kill threshold is higher", () => {
    const result = generateBtcSignal(
      series((price, index) => price * (index % 3 === 0 ? 1.05 : 0.9)),
      {
        now: new Date("2026-07-10T00:10:00.000Z"),
        walletContextScore: "0",
        volatilityKillThreshold: "999",
      },
    );
    expect(result.action).toBe("SELL");
    expect(Number(result.compositeScore)).toBeLessThanOrEqual(30);
  });

  it("forces WATCH when required source data is older than 24 hours", () => {
    const result = generateBtcSignal(
      series((price) => price * 1.02, new Date("2026-07-07T23:59:59.999Z")),
      { now: new Date("2026-07-10T00:10:00.000Z"), walletContextScore: "100" },
    );
    expect(result.action).toBe("WATCH");
    expect(result.freshness).toBe("STALE");
    expect(result.riskKillSwitch).toBe(true);
  });
});
