import Decimal from "decimal.js";
import { previousMonth } from "@/lib/format";
import type {
  Holding,
  FxRate,
  MarketPrice,
  PortfolioSummary,
  PortfolioTransaction,
  SpendingSummary,
  SpendingTransaction,
} from "@/lib/types";

const zero = new Decimal(0);
const sumDecimals = (values: Decimal[]) => values.reduce((total, value) => total.add(value), new Decimal(0));

export function calculatePortfolio(
  transactions: PortfolioTransaction[],
  prices: MarketPrice[],
): PortfolioSummary {
  const assets = new Map<
    string,
    { quantity: Decimal; cost: Decimal; realized: Decimal; incomplete: boolean }
  >();

  const sorted = [...transactions].sort(
    (a, b) => new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime(),
  );

  for (const transaction of sorted) {
    const state = assets.get(transaction.assetSymbol) ?? {
      quantity: zero,
      cost: zero,
      realized: zero,
      incomplete: false,
    };
    const quantity = new Decimal(transaction.quantity || 0);
    const price = new Decimal(transaction.unitPriceUsd || 0);
    const fee = new Decimal(transaction.feeUsd || 0);
    const averageCost = state.quantity.gt(0) ? state.cost.div(state.quantity) : zero;

    switch (transaction.transactionType) {
      case "BUY":
        state.quantity = state.quantity.add(quantity);
        state.cost = state.cost.add(quantity.mul(price)).add(fee);
        break;
      case "SELL": {
        const sold = Decimal.min(quantity, state.quantity);
        const releasedCost = averageCost.mul(sold);
        state.quantity = state.quantity.sub(sold);
        state.cost = Decimal.max(0, state.cost.sub(releasedCost));
        state.realized = state.realized.add(sold.mul(price).sub(fee).sub(releasedCost));
        break;
      }
      case "TRANSFER_IN":
      case "REWARD":
      case "AIRDROP":
        state.quantity = state.quantity.add(quantity);
        if (price.gt(0)) state.cost = state.cost.add(quantity.mul(price)).add(fee);
        else state.incomplete = true;
        break;
      case "TRANSFER_OUT": {
        const moved = Decimal.min(quantity, state.quantity);
        state.quantity = state.quantity.sub(moved);
        state.cost = Decimal.max(0, state.cost.sub(averageCost.mul(moved)));
        break;
      }
      case "FEE":
        state.realized = state.realized.sub(fee);
        break;
    }
    assets.set(transaction.assetSymbol, state);
  }

  const rawHoldings = [...assets.entries()]
    .filter(([, state]) => state.quantity.gt(0))
    .map(([assetSymbol, state]) => {
      const market = prices.find((price) => price.assetSymbol === assetSymbol);
      const currentPrice = new Decimal(market?.priceUsd ?? 0);
      const currentValue = state.quantity.mul(currentPrice);
      return { assetSymbol, state, market, currentPrice, currentValue };
    });

  const totalValue = sumDecimals(rawHoldings.map((holding) => holding.currentValue));
  const holdings: Holding[] = rawHoldings.map(
    ({ assetSymbol, state, market, currentPrice, currentValue }) => ({
      assetSymbol,
      name: market?.name ?? assetSymbol,
      quantity: state.quantity.toString(),
      averageCostUsd: state.quantity.gt(0) ? state.cost.div(state.quantity).toString() : "0",
      currentPriceUsd: currentPrice.toString(),
      currentValueUsd: currentValue.toString(),
      costBasisUsd: state.cost.toString(),
      realizedPnlUsd: state.realized.toString(),
      unrealizedPnlUsd: currentValue.sub(state.cost).toString(),
      allocationPct: totalValue.gt(0) ? currentValue.div(totalValue).mul(100).toString() : "0",
      dailyChangePct: market?.dailyChangePct ?? "0",
      incompleteBasis: state.incomplete,
    }),
  );

  const totalCost = sumDecimals(holdings.map((holding) => new Decimal(holding.costBasisUsd)));
  const realized = sumDecimals(holdings.map((holding) => new Decimal(holding.realizedPnlUsd)));
  const unrealized = totalValue.sub(totalCost);
  const weightedDaily = totalValue.gt(0)
    ? sumDecimals(
        holdings.map((holding) =>
          new Decimal(holding.currentValueUsd).mul(holding.dailyChangePct).div(totalValue),
        ),
      )
    : zero;

  return {
    totalValueUsd: totalValue.toString(),
    totalCostBasisUsd: totalCost.toString(),
    realizedPnlUsd: realized.toString(),
    unrealizedPnlUsd: unrealized.toString(),
    dailyChangePct: weightedDaily.toString(),
    incompleteBasis: holdings.some((holding) => holding.incompleteBasis),
    holdings,
  };
}

export function calculateSpending(
  transactions: SpendingTransaction[],
  month: string,
  rates: FxRate[] = [],
): SpendingSummary {
  const current = transactions.filter((item) => item.occurredOn.startsWith(month));
  const priorKey = previousMonth(month);
  const prior = transactions.filter((item) => item.occurredOn.startsWith(priorKey));
  const sum = (items: SpendingTransaction[], direction: "INCOME" | "EXPENSE") =>
    sumDecimals(
      items
        .filter((item) => item.direction === direction)
        .map((item) => {
          const rate = rates.find((rateItem) => rateItem.currency === item.currency)?.usdRate ?? "1";
          return new Decimal(item.amount).div(rate);
        }),
    );
  const income = sum(current, "INCOME");
  const expenses = sum(current, "EXPENSE");
  const priorIncome = sum(prior, "INCOME");
  const priorExpenses = sum(prior, "EXPENSE");
  const categories = new Map<string, Decimal>();
  current
    .filter((item) => item.direction === "EXPENSE")
    .forEach((item) => {
      const rate = rates.find((rateItem) => rateItem.currency === item.currency)?.usdRate ?? "1";
      categories.set(item.category, (categories.get(item.category) ?? zero).add(new Decimal(item.amount).div(rate)));
    });

  return {
    month,
    incomeUsd: income.toString(),
    expensesUsd: expenses.toString(),
    savingsUsd: income.sub(expenses).toString(),
    savingsRatePct: income.gt(0) ? income.sub(expenses).div(income).mul(100).toString() : "0",
    previousIncomeUsd: priorIncome.toString(),
    previousExpensesUsd: priorExpenses.toString(),
    expenseChangePct: priorExpenses.gt(0)
      ? expenses.sub(priorExpenses).div(priorExpenses).mul(100).toString()
      : "0",
    byCategory: [...categories.entries()]
      .map(([category, amount]) => ({ category, amountUsd: amount.toString() }))
      .sort((a, b) => new Decimal(b.amountUsd).cmp(a.amountUsd)),
  };
}

export function maxSellableQuantity(
  transactions: PortfolioTransaction[],
  assetSymbol: string,
) {
  const summary = calculatePortfolio(transactions, []);
  return summary.holdings.find((item) => item.assetSymbol === assetSymbol)?.quantity ?? "0";
}
