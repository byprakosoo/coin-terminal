import Decimal from "decimal.js";
import type { DecimalString } from "@/lib/types";
import type { PortfolioSnapshotValues } from "./types";

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
