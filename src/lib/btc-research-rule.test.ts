import { describe, expect, it } from "vitest";
import {
  btcResearchRuleConfig,
  deriveBtcWalletContext,
  deriveCftcBtcInstitutionalContext,
} from "@/lib/btc-research-rule";

describe("deriveBtcWalletContext", () => {
  it("stays neutral when no qualified BTC movements exist", () => {
    expect(deriveBtcWalletContext([])).toEqual({
      score: "50.00",
      inflowBtc: "0",
      outflowBtc: "0",
      netBtc: "0",
      movementCount: 0,
      activeWalletCount: 0,
      hasObservations: false,
    });
  });

  it("raises context for net inflows without treating them as buys", () => {
    const result = deriveBtcWalletContext([
      { walletId: "wallet-a", direction: "TRANSFER_IN", quantityBtc: "2" },
      { walletId: "wallet-b", direction: "TRANSFER_OUT", quantityBtc: "0.5" },
    ]);

    expect(result.score).toBe("74.00");
    expect(result.netBtc).toBe("1.5");
    expect(result.activeWalletCount).toBe(2);
  });

  it("bounds one-sided flow and ignores invalid quantities", () => {
    const result = deriveBtcWalletContext([
      { walletId: "wallet-a", direction: "TRANSFER_OUT", quantityBtc: "4" },
      { walletId: "wallet-a", direction: "TRANSFER_IN", quantityBtc: "invalid" },
    ]);

    expect(result.score).toBe("10.00");
    expect(result.movementCount).toBe(1);
    expect(result.netBtc).toBe("-4");
  });
});

describe("deriveCftcBtcInstitutionalContext", () => {
  const latestCftcRow = {
    reportDate: "2026-07-07",
    openInterestContracts: "18832",
    assetManagerLongContracts: "4790",
    assetManagerShortContracts: "2405",
    assetManagerSpreadContracts: "129",
    changeAssetManagerLongContracts: "36",
    changeAssetManagerShortContracts: "-349",
    assetManagerLongTraders: 7,
    assetManagerShortTraders: 10,
  };

  it("scores official asset-manager net positioning and its weekly change", () => {
    const result = deriveCftcBtcInstitutionalContext(
      latestCftcRow,
      new Date("2026-07-13T23:59:59.999Z"),
    );

    expect(result.available).toBe(true);
    expect(result.stale).toBe(false);
    expect(result.netContracts).toBe("2385");
    expect(result.weeklyNetChangeContracts).toBe("385");
    expect(result.netBtcEquivalent).toBe("11925");
    expect(Number(result.score)).toBeGreaterThan(69);
    expect(Number(result.score)).toBeLessThanOrEqual(70);
  });

  it("neutralizes an over-age report without hiding its raw score", () => {
    const result = deriveCftcBtcInstitutionalContext(
      latestCftcRow,
      new Date("2026-07-23T23:59:59.999Z"),
    );

    expect(result.stale).toBe(true);
    expect(result.available).toBe(false);
    expect(result.score).toBe("50.00");
    expect(Number(result.rawScore)).toBeGreaterThan(69);
  });

  it("neutralizes invalid position data", () => {
    const result = deriveCftcBtcInstitutionalContext(
      { ...latestCftcRow, openInterestContracts: "0" },
      new Date("2026-07-13T23:59:59.999Z"),
    );

    expect(result.available).toBe(false);
    expect(result.score).toBe("50.00");
  });

  it("keeps all frozen research weights at exactly 100 percent", () => {
    const total = Object.values(btcResearchRuleConfig.weights).reduce(
      (sum, value) => sum + Number(value),
      0,
    );
    expect(total).toBe(100);
  });
});
