import Decimal from "decimal.js";
import type { DecimalString } from "@/lib/types";
import type { GoldSummary, GoldTransaction, GoldValuation, PortfolioSnapshotValues } from "./types";

const toDecimal = (value: DecimalString | number | undefined) => new Decimal(value || 0);
const sumDecimals = (values: Decimal[]) =>
  values.reduce((total, value) => total.add(value), new Decimal(0));

/**
 * Deterministic snapshot breakdown (PRD §7.1). Pure and side-effect free so the
 * same function can be used for live form previews, chart data preparation, and
 * (later) server-side authoritative calculation. All values are decimal strings.
 */
export interface SnapshotBreakdown {
  liquidIdr: DecimalString;
  stocksIdr: DecimalString;
  cryptoIdr: DecimalString;
  goldIdr: DecimalString;
  totalIdr: DecimalString;
  totalUsd?: DecimalString;
  allocationPct: PortfolioSnapshotValues;
  groupedPct: {
    liquid: DecimalString;
    stocks: DecimalString;
    crypto: DecimalString;
    gold: DecimalString;
  };
  cryptoSplitPct: { btc: DecimalString; eth: DecimalString; altcoin: DecimalString };
  stocksSplitPct: { ihsg: DecimalString; sp500: DecimalString };
}

export function computeSnapshotBreakdown(
  values: PortfolioSnapshotValues,
  idrPerUsd?: DecimalString,
): SnapshotBreakdown {
  const bank = toDecimal(values.bankIdr);
  const rdpu = toDecimal(values.rdpuIdr);
  const ihsg = toDecimal(values.ihsgIdr);
  const sp500 = toDecimal(values.sp500Idr);
  const btc = toDecimal(values.btcIdr);
  const eth = toDecimal(values.ethIdr);
  const altcoin = toDecimal(values.altcoinIdr);
  const gold = toDecimal(values.goldIdr);

  const liquid = bank.add(rdpu);
  const stocks = ihsg.add(sp500);
  const crypto = btc.add(eth).add(altcoin);
  const total = liquid.add(stocks).add(crypto).add(gold);
  const pct = (part: Decimal) => (total.gt(0) ? part.div(total).mul(100) : new Decimal(0));

  return {
    liquidIdr: liquid.toString(),
    stocksIdr: stocks.toString(),
    cryptoIdr: crypto.toString(),
    goldIdr: gold.toString(),
    totalIdr: total.toString(),
    totalUsd:
      idrPerUsd && toDecimal(idrPerUsd).gt(0)
        ? total.div(idrPerUsd).toString()
        : undefined,
    allocationPct: {
      bankIdr: pct(bank).toString(),
      rdpuIdr: pct(rdpu).toString(),
      ihsgIdr: pct(ihsg).toString(),
      sp500Idr: pct(sp500).toString(),
      btcIdr: pct(btc).toString(),
      ethIdr: pct(eth).toString(),
      altcoinIdr: pct(altcoin).toString(),
      goldIdr: pct(gold).toString(),
    },
    groupedPct: {
      liquid: pct(liquid).toString(),
      stocks: pct(stocks).toString(),
      crypto: pct(crypto).toString(),
      gold: pct(gold).toString(),
    },
    cryptoSplitPct: {
      btc: pct(btc).toString(),
      eth: pct(eth).toString(),
      altcoin: pct(altcoin).toString(),
    },
    stocksSplitPct: {
      ihsg: pct(ihsg).toString(),
      sp500: pct(sp500).toString(),
    },
  };
}

export interface SnapshotHistoryPoint {
  date: string;
  total: number;
  liquid: number;
  stocks: number;
  crypto: number;
  gold: number;
}

/**
 * Builds chart-ready history points from frozen snapshots. Conversion to number
 * is the final presentation boundary for the charting component (PRD §7).
 */
export function snapshotHistory(
  snapshots: ReadonlyArray<PortfolioSnapshotValues & { asOfDate: string }>,
): SnapshotHistoryPoint[] {
  return snapshots
    .map((snapshot) => {
      const breakdown = computeSnapshotBreakdown(snapshot);
      return {
        date: snapshot.asOfDate,
        total: Number(breakdown.totalIdr),
        liquid: Number(breakdown.liquidIdr),
        stocks: Number(breakdown.stocksIdr),
        crypto: Number(breakdown.cryptoIdr),
        gold: Number(breakdown.goldIdr),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function sumCategory(
  snapshots: ReadonlyArray<PortfolioSnapshotValues>,
  key: keyof PortfolioSnapshotValues,
): DecimalString {
  return sumDecimals(snapshots.map((snapshot) => toDecimal(snapshot[key]))).toString();
}

/**
 * Deterministic gold accounting (PRD §7.3). Transactions and valuations are
 * copied before sorting so callers can safely pass read-model arrays directly.
 */
export function computeGoldSummary(
  transactions: ReadonlyArray<GoldTransaction>,
  valuations: ReadonlyArray<GoldValuation>,
): GoldSummary {
  const sortedTransactions = [...transactions].sort(
    (a, b) =>
      a.occurredOn.localeCompare(b.occurredOn) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
  const sortedValuations = [...valuations].sort(
    (a, b) =>
      a.asOfDate.localeCompare(b.asOfDate) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );

  let heldGrams = new Decimal(0);
  let remainingCostBasisIdr = new Decimal(0);
  let soldGrams = new Decimal(0);
  let saleProceedsIdr = new Decimal(0);
  let realizedPnlIdr = new Decimal(0);
  let grossPurchaseCostIdr = new Decimal(0);

  for (const transaction of sortedTransactions) {
    const grams = new Decimal(transaction.grams);
    const value = grams.mul(transaction.unitPriceIdr);
    if (transaction.transactionType === "BUY") {
      heldGrams = heldGrams.plus(grams);
      remainingCostBasisIdr = remainingCostBasisIdr.plus(value);
      grossPurchaseCostIdr = grossPurchaseCostIdr.plus(value);
      continue;
    }

    const releasedCost = heldGrams.gt(0)
      ? remainingCostBasisIdr.div(heldGrams).mul(grams)
      : new Decimal(0);
    heldGrams = heldGrams.minus(grams);
    remainingCostBasisIdr = Decimal.max(0, remainingCostBasisIdr.minus(releasedCost));
    soldGrams = soldGrams.plus(grams);
    saleProceedsIdr = saleProceedsIdr.plus(value);
    realizedPnlIdr = realizedPnlIdr.plus(value.minus(releasedCost));
  }

  const valuation = sortedValuations.at(-1);
  const marketValueIdr = valuation
    ? heldGrams.mul(valuation.pricePerGramIdr)
    : undefined;
  const unrealizedPnlIdr = marketValueIdr?.minus(remainingCostBasisIdr);

  return {
    heldGrams: heldGrams.toString(),
    valuationPricePerGramIdr: valuation?.pricePerGramIdr,
    valuationDate: valuation?.asOfDate,
    marketValueIdr: marketValueIdr?.toString(),
    remainingCostBasisIdr: remainingCostBasisIdr.toString(),
    averageCostPerGramIdr: heldGrams.gt(0)
      ? remainingCostBasisIdr.div(heldGrams).toString()
      : "0",
    grossPurchaseCostIdr: grossPurchaseCostIdr.toString(),
    soldGrams: soldGrams.toString(),
    saleProceedsIdr: saleProceedsIdr.toString(),
    realizedPnlIdr: realizedPnlIdr.toString(),
    unrealizedPnlIdr: unrealizedPnlIdr?.toString(),
    unrealizedPnlPct:
      unrealizedPnlIdr && remainingCostBasisIdr.gt(0)
        ? unrealizedPnlIdr.div(remainingCostBasisIdr).mul(100).toString()
        : undefined,
  };
}
