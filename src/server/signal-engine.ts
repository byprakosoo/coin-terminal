import Decimal from "decimal.js";
import type { EvidenceKind, Freshness, SignalAction } from "@/lib/types";

export interface DailyClose {
  date: string;
  close: string;
  observedAt: Date;
}

export interface GeneratedSignalEvidence {
  group: string;
  rule: string;
  weightPct: string;
  score: string;
  value: string;
  interpretation: string;
  source: string;
  sourceUrl: string;
  observedAt: Date;
  kind: EvidenceKind;
  details: Record<string, unknown>;
}

export interface GeneratedSignal {
  action: SignalAction;
  compositeScore: string;
  confidencePct: string;
  freshness: Freshness;
  summary: string;
  evidence: GeneratedSignalEvidence[];
  riskKillSwitch: boolean;
}

const weights = {
  momentum: new Decimal(30),
  trend: new Decimal(25),
  meanReversion: new Decimal(20),
  volatility: new Decimal(15),
  wallets: new Decimal(10),
};

export function generateBtcSignal(
  closes: DailyClose[],
  options: { now?: Date; walletContextScore?: string; volatilityKillThreshold?: string } = {},
): GeneratedSignal {
  if (closes.length < 51) throw new Error("At least 51 daily closes are required.");
  const sorted = [...closes].sort((a, b) => a.date.localeCompare(b.date));
  const now = options.now ?? new Date();
  const latest = sorted.at(-1)!;
  const closeValues = sorted.map((point) => new Decimal(point.close));
  const latestClose = closeValues.at(-1)!;
  const return7 = percentReturn(latestClose, closeValues.at(-8)!);
  const return30 = percentReturn(latestClose, closeValues.at(-31)!);
  const ma20 = average(closeValues.slice(-20));
  const ma50 = average(closeValues.slice(-50));
  const rsi14 = rsi(closeValues.slice(-15));
  const volatility30 = realizedVolatility(closeValues.slice(-31));
  const momentumScore = clamp(new Decimal(50).add(return7.mul(3)).add(return30));
  const trendScore = clamp(
    new Decimal(50)
      .add(latestClose.gte(ma20) ? 25 : -25)
      .add(ma20.gte(ma50) ? 25 : -25),
  );
  const meanReversionScore = rsiScore(rsi14);
  const volatilityScore = clamp(new Decimal(100).sub(volatility30));
  const walletScore = clamp(new Decimal(options.walletContextScore ?? 50));
  const composite = momentumScore
    .mul(weights.momentum)
    .add(trendScore.mul(weights.trend))
    .add(meanReversionScore.mul(weights.meanReversion))
    .add(volatilityScore.mul(weights.volatility))
    .add(walletScore.mul(weights.wallets))
    .div(100);
  const stale = now.getTime() - latest.observedAt.getTime() > 24 * 60 * 60 * 1000;
  const riskKillSwitch = stale || volatility30.gt(options.volatilityKillThreshold ?? "95");
  const action: SignalAction = riskKillSwitch
    ? "WATCH"
    : composite.gte(70)
      ? "BUY"
      : composite.lte(30)
        ? "SELL"
        : "WATCH";
  const confidence = clamp(
    new Decimal(55).add(Decimal.abs(composite.sub(50)).mul("0.6")).sub(stale ? 35 : 0),
  );
  const freshness: Freshness = stale ? "STALE" : "FRESH";
  const sourceUrl = "https://www.coingecko.com/en/coins/bitcoin/historical_data";

  const evidence: GeneratedSignalEvidence[] = [
    {
      group: "Price momentum",
      rule: "7D / 30D return",
      weightPct: weights.momentum.toString(),
      score: momentumScore.toFixed(2),
      value: `${signed(return7)}% / ${signed(return30)}%`,
      interpretation: "Recent and monthly returns are normalized into a bounded momentum score.",
      source: "CoinGecko BTC daily history",
      sourceUrl,
      observedAt: latest.observedAt,
      kind: "OBSERVED",
      details: { return7dPct: return7.toString(), return30dPct: return30.toString() },
    },
    {
      group: "Trend",
      rule: "Price / 20D / 50D moving averages",
      weightPct: weights.trend.toString(),
      score: trendScore.toFixed(2),
      value: `${latestClose.toFixed(2)} / ${ma20.toFixed(2)} / ${ma50.toFixed(2)}`,
      interpretation: "Trend improves when price is above MA20 and MA20 is above MA50.",
      source: "Calculated from CoinGecko daily closes",
      sourceUrl,
      observedAt: latest.observedAt,
      kind: "CALCULATED",
      details: { close: latestClose.toString(), ma20: ma20.toString(), ma50: ma50.toString() },
    },
    {
      group: "Mean reversion",
      rule: "14-day RSI",
      weightPct: weights.meanReversion.toString(),
      score: meanReversionScore.toFixed(2),
      value: rsi14.toFixed(2),
      interpretation: "Very warm RSI reduces entry quality; oversold readings improve it.",
      source: "Calculated from CoinGecko daily closes",
      sourceUrl,
      observedAt: latest.observedAt,
      kind: "CALCULATED",
      details: { rsi14: rsi14.toString() },
    },
    {
      group: "Volatility risk",
      rule: "30D annualized realized volatility",
      weightPct: weights.volatility.toString(),
      score: volatilityScore.toFixed(2),
      value: `${volatility30.toFixed(2)}% annualized`,
      interpretation: "Higher realized volatility lowers conviction and can activate the risk kill switch.",
      source: "Calculated from CoinGecko daily closes",
      sourceUrl,
      observedAt: latest.observedAt,
      kind: "CALCULATED",
      details: { annualizedVolatilityPct: volatility30.toString() },
    },
    {
      group: "Public-wallet context",
      rule: "Observed qualified flows",
      weightPct: weights.wallets.toString(),
      score: walletScore.toFixed(2),
      value: `${walletScore.toFixed(2)} / 100`,
      interpretation: "Public-wallet flow is a contextual proxy and is never treated as verified identity.",
      source: "Qualified public-wallet observations",
      sourceUrl: "https://mempool.space/",
      observedAt: latest.observedAt,
      kind: "INFERRED",
      details: { walletContextScore: walletScore.toString() },
    },
  ];

  return {
    action,
    compositeScore: composite.toFixed(2),
    confidencePct: confidence.toFixed(2),
    freshness,
    riskKillSwitch,
    summary: riskKillSwitch
      ? stale
        ? "Required market data is stale, so the risk kill switch forced WATCH."
        : "Realized volatility exceeded the configured threshold, so the risk kill switch forced WATCH."
      : action === "BUY"
        ? "The weighted evidence met the BUY research threshold with fresh source data."
        : action === "SELL"
          ? "The weighted evidence met the SELL research threshold with fresh source data."
          : "The weighted evidence remains between directional thresholds or contains conflicting factors.",
    evidence,
  };
}

export function movingAverageSeries(closes: DailyClose[]) {
  const sorted = [...closes].sort((a, b) => a.date.localeCompare(b.date));
  const values = sorted.map((point) => new Decimal(point.close));
  return sorted.map((point, index) => ({
    date: point.date,
    close: point.close,
    ma20: average(values.slice(Math.max(0, index - 19), index + 1)).toFixed(2),
    ma50: average(values.slice(Math.max(0, index - 49), index + 1)).toFixed(2),
    observedAt: point.observedAt,
  }));
}

function average(values: Decimal[]) {
  return values.reduce((sum, value) => sum.add(value), new Decimal(0)).div(values.length || 1);
}

function percentReturn(current: Decimal, previous: Decimal) {
  return current.div(previous).sub(1).mul(100);
}

function rsi(values: Decimal[]) {
  let gains = new Decimal(0);
  let losses = new Decimal(0);
  for (let index = 1; index < values.length; index += 1) {
    const change = values[index].sub(values[index - 1]);
    if (change.gte(0)) gains = gains.add(change);
    else losses = losses.add(change.abs());
  }
  if (losses.isZero()) return new Decimal(100);
  const relativeStrength = gains.div(values.length - 1).div(losses.div(values.length - 1));
  return new Decimal(100).sub(new Decimal(100).div(relativeStrength.add(1)));
}

function rsiScore(value: Decimal) {
  if (value.lte(30)) return new Decimal(85);
  if (value.lte(50)) return new Decimal(85).sub(value.sub(30).mul("0.75"));
  if (value.lte(70)) return new Decimal(70).sub(value.sub(50).mul("1.5"));
  return Decimal.max(10, new Decimal(40).sub(value.sub(70).mul(2)));
}

function realizedVolatility(values: Decimal[]) {
  const returns = values.slice(1).map((value, index) => value.div(values[index]).ln());
  const mean = average(returns);
  const variance = average(returns.map((value) => value.sub(mean).pow(2)));
  return variance.sqrt().mul(new Decimal(365).sqrt()).mul(100);
}

function clamp(value: Decimal) {
  return Decimal.max(0, Decimal.min(100, value));
}

function signed(value: Decimal) {
  return `${value.gte(0) ? "+" : ""}${value.toFixed(2)}`;
}
