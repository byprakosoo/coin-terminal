import { describe, expect, it } from "vitest";
import { computeSnapshotBreakdown, snapshotHistory, sumCategory } from "./recap-calc";
import type { PortfolioSnapshot, PortfolioSnapshotValues } from "./types";

const values = (overrides: Partial<PortfolioSnapshotValues> = {}): PortfolioSnapshotValues => ({
  bankIdr: "100000",
  rdpuIdr: "50000",
  ihsgIdr: "200000",
  sp500Idr: "300000",
  btcIdr: "400000",
  ethIdr: "150000",
  altcoinIdr: "50000",
  goldIdr: "250000",
  ...overrides,
});

describe("computeSnapshotBreakdown", () => {
  it("sums the four groups and the total", () => {
    const breakdown = computeSnapshotBreakdown(values());
    expect(breakdown.liquidIdr).toBe("150000");
    expect(breakdown.stocksIdr).toBe("500000");
    expect(breakdown.cryptoIdr).toBe("600000");
    expect(breakdown.goldIdr).toBe("250000");
    expect(breakdown.totalIdr).toBe("1500000");
  });

  it("allocates each category against the total", () => {
    const breakdown = computeSnapshotBreakdown(values());
    expect(breakdown.allocationPct.bankIdr).toBe("6.6666666666666666667");
    expect(breakdown.groupedPct.gold).toBe("16.666666666666666667");
    expect(breakdown.cryptoSplitPct.btc).toBe("26.666666666666666667");
    expect(breakdown.stocksSplitPct.ihsg).toBe("13.333333333333333333");
  });

  it("returns zero allocation when the total is zero", () => {
    const zero = values({
      bankIdr: "0",
      rdpuIdr: "0",
      ihsgIdr: "0",
      sp500Idr: "0",
      btcIdr: "0",
      ethIdr: "0",
      altcoinIdr: "0",
      goldIdr: "0",
    });
    const breakdown = computeSnapshotBreakdown(zero);
    expect(breakdown.totalIdr).toBe("0");
    expect(breakdown.allocationPct.bankIdr).toBe("0");
    expect(breakdown.groupedPct.liquid).toBe("0");
  });

  it("converts to USD only when a positive frozen FX rate is provided", () => {
    expect(computeSnapshotBreakdown(values(), "15000").totalUsd).toBe("100");
    expect(computeSnapshotBreakdown(values(), "0")?.totalUsd).toBeUndefined();
    expect(computeSnapshotBreakdown(values()).totalUsd).toBeUndefined();
  });
});

describe("snapshotHistory", () => {
  it("orders ascending by date and maps totals", () => {
    const snapshots: PortfolioSnapshot[] = [
      { ...values({ bankIdr: "200000" }), id: "b", asOfDate: "2026-02-01", sequence: 1, source: "MANUAL", createdAt: "2026-02-01T00:00:00Z", updatedAt: "2026-02-01T00:00:00Z" },
      { ...values(), id: "a", asOfDate: "2026-01-01", sequence: 1, source: "MANUAL", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
    ];
    const history = snapshotHistory(snapshots);
    expect(history.map((point) => point.date)).toEqual(["2026-01-01", "2026-02-01"]);
    expect(history[0].total).toBe(1500000);
    expect(history[1].total).toBe(1600000);
  });
});

describe("sumCategory", () => {
  it("sums a single category across snapshots", () => {
    const snapshots: PortfolioSnapshotValues[] = [
      values({ bankIdr: "100000" }),
      values({ bankIdr: "250000" }),
    ];
    expect(sumCategory(snapshots, "bankIdr")).toBe("350000");
  });
});
