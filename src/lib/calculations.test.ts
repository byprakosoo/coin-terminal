import { describe, expect, it } from "vitest";
import { calculatePortfolio, calculateSpending } from "@/lib/calculations";
import type { MarketPrice, PortfolioTransaction, SpendingTransaction } from "@/lib/types";

const price: MarketPrice = {
  assetSymbol: "BTC",
  name: "Bitcoin",
  priceUsd: "400",
  dailyChangePct: "5",
  observedAt: "2026-07-10T00:00:00.000Z",
  freshness: "FRESH",
};

describe("calculatePortfolio", () => {
  it("uses average-cost basis and includes applicable fees", () => {
    const transactions: PortfolioTransaction[] = [
      { id: "1", assetSymbol: "BTC", transactionType: "BUY", quantity: "1", unitPriceUsd: "100", feeUsd: "10", venue: "A", executedAt: "2026-01-01T00:00:00.000Z" },
      { id: "2", assetSymbol: "BTC", transactionType: "BUY", quantity: "1", unitPriceUsd: "200", feeUsd: "0", venue: "A", executedAt: "2026-02-01T00:00:00.000Z" },
      { id: "3", assetSymbol: "BTC", transactionType: "SELL", quantity: "0.5", unitPriceUsd: "300", feeUsd: "5", venue: "A", executedAt: "2026-03-01T00:00:00.000Z" },
    ];
    const summary = calculatePortfolio(transactions, [price]);
    expect(summary.totalValueUsd).toBe("600");
    expect(summary.totalCostBasisUsd).toBe("232.5");
    expect(summary.realizedPnlUsd).toBe("67.5");
    expect(summary.unrealizedPnlUsd).toBe("367.5");
    expect(summary.holdings[0].averageCostUsd).toBe("155");
  });

  it("flags incoming quantity without a basis instead of inventing one", () => {
    const summary = calculatePortfolio([
      { id: "1", assetSymbol: "BTC", transactionType: "TRANSFER_IN", quantity: "1", unitPriceUsd: "0", feeUsd: "0", venue: "Wallet", executedAt: "2026-01-01T00:00:00.000Z" },
    ], [price]);
    expect(summary.incompleteBasis).toBe(true);
    expect(summary.holdings[0].incompleteBasis).toBe(true);
    expect(summary.holdings[0].costBasisUsd).toBe("0");
  });

  it("returns a safe empty summary", () => {
    expect(calculatePortfolio([], [])).toEqual({
      totalValueUsd: "0",
      totalCostBasisUsd: "0",
      realizedPnlUsd: "0",
      unrealizedPnlUsd: "0",
      dailyChangePct: "0",
      incompleteBasis: false,
      holdings: [],
    });
  });
});

describe("calculateSpending", () => {
  it("calculates monthly totals, savings, comparisons, and categories", () => {
    const rows: SpendingTransaction[] = [
      { id: "1", occurredOn: "2026-07-01", amount: "1000", currency: "USD", direction: "INCOME", category: "Salary", account: "Bank" },
      { id: "2", occurredOn: "2026-07-02", amount: "300", currency: "USD", direction: "EXPENSE", category: "Housing", account: "Bank" },
      { id: "3", occurredOn: "2026-07-03", amount: "100", currency: "USD", direction: "EXPENSE", category: "Food", account: "Card" },
      { id: "4", occurredOn: "2026-06-03", amount: "500", currency: "USD", direction: "EXPENSE", category: "Housing", account: "Bank" },
    ];
    const summary = calculateSpending(rows, "2026-07");
    expect(summary.incomeUsd).toBe("1000");
    expect(summary.expensesUsd).toBe("400");
    expect(summary.savingsUsd).toBe("600");
    expect(summary.savingsRatePct).toBe("60");
    expect(summary.expenseChangePct).toBe("-20");
    expect(summary.byCategory[0]).toEqual({ category: "Housing", amountUsd: "300" });
  });

  it("normalizes non-USD rows through the supplied FX snapshot", () => {
    const rows: SpendingTransaction[] = [
      { id: "1", occurredOn: "2026-07-01", amount: "92", currency: "EUR", direction: "EXPENSE", category: "Travel", account: "Card" },
    ];
    const summary = calculateSpending(rows, "2026-07", [
      { currency: "EUR", usdRate: "0.92", observedAt: "2026-07-10T00:00:00.000Z", freshness: "FRESH" },
    ]);
    expect(summary.expensesUsd).toBe("100");
    expect(summary.byCategory[0]).toEqual({ category: "Travel", amountUsd: "100" });
  });
});
