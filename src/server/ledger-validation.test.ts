import { describe, expect, it } from "vitest";
import type { PortfolioTransaction } from "@/lib/types";
import { findLedgerSequenceIssue } from "@/server/ledger-validation";

const base = {
  assetSymbol: "BTC",
  unitPriceUsd: "50000",
  feeUsd: "0",
  venue: "Test",
} as const;

describe("findLedgerSequenceIssue", () => {
  it("rejects a sale that occurs before the funding buy", () => {
    const rows: PortfolioTransaction[] = [
      { ...base, id: "sell", transactionType: "SELL", quantity: "0.5", executedAt: "2026-01-01T00:00:00.000Z" },
      { ...base, id: "buy", transactionType: "BUY", quantity: "1", executedAt: "2026-01-02T00:00:00.000Z" },
    ];
    expect(findLedgerSequenceIssue(rows)).toMatchObject({ transactionId: "sell", availableQuantity: "0" });
  });

  it("allows buys, transfers, and sales that remain funded chronologically", () => {
    const rows: PortfolioTransaction[] = [
      { ...base, id: "buy", transactionType: "BUY", quantity: "1", executedAt: "2026-01-01T00:00:00.000Z" },
      { ...base, id: "out", transactionType: "TRANSFER_OUT", quantity: "0.25", executedAt: "2026-01-02T00:00:00.000Z" },
      { ...base, id: "sell", transactionType: "SELL", quantity: "0.75", executedAt: "2026-01-03T00:00:00.000Z" },
    ];
    expect(findLedgerSequenceIssue(rows)).toBeUndefined();
  });
});
