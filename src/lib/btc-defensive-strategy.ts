import Decimal from "decimal.js";
import type { SignalAction } from "@/lib/types";

export const defensiveRuleVersion = "btc-defensive-v2.0.0";

export const defensiveRuleConfig = {
  instrument: "BTC/USD",
  cadence: "1D_UTC",
  smaMediumDays: 50,
  smaLongDays: 200,
  momentumShortDays: 90,
  momentumLongDays: 180,
  volatilityDays: 30,
  volatilityRiskOnMaxPct: 80,
  volatilityHardExitPct: 90,
  trailingDrawdownDays: 20,
  trailingDrawdownHardExitPct: -10,
  dailyReturnHardExitPct: -6,
  longTrendHardExitGapPct: -3,
  buyConfirmationDays: 5,
  hardExitRecoveryDays: 10,
  buyCooldownDays: 10,
  sellConfirmationDays: 2,
  positionStepPct: 10,
  maximumAllocationPct: 50,
  baseCostBps: 25,
  stressCostBps: 50,
  consensusMaxDeviationPct: 1.5,
} as const;

export interface StrategyCandle {
  date: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
  executionPrice?: string;
}

export interface DefensiveStrategyState {
  modelAllocationPct: string;
  lastModelChangeDate?: string;
  recoveringFromHardExit?: boolean;
}

export interface DefensiveEvidence {
  key: string;
  label: string;
  passed: boolean;
  value: string;
  threshold: string;
  interpretation: string;
}

export interface DefensiveSignalDecision {
  action: SignalAction;
  targetAllocationPct: string;
  deltaAllocationPct: string;
  agreementPct: string;
  hardExit: boolean;
  recoveringFromHardExit: boolean;
  riskOnStreak: number;
  riskOffStreak: number;
  summary: string;
  metrics: DefensiveMetrics;
  evidence: DefensiveEvidence[];
}

export interface DefensiveMetrics {
  close: string;
  sma50: string;
  sma200: string;
  return1dPct: string;
  return90dPct: string;
  return180dPct: string;
  volatility30dPct: string;
  drawdown20dPct: string;
  distanceFromSma200Pct: string;
}

type IndicatorSnapshot = ReturnType<typeof indicatorSnapshot>;

export interface DefensiveStrategyContext {
  candles: StrategyCandle[];
  snapshots: Array<IndicatorSnapshot | undefined>;
}

export function evaluateDefensiveSignal(
  input: StrategyCandle[],
  state: DefensiveStrategyState,
): DefensiveSignalDecision {
  const context = buildDefensiveStrategyContext(input);
  return evaluateDefensiveSignalAt(context, context.candles.length - 1, state);
}

export function buildDefensiveStrategyContext(input: StrategyCandle[]): DefensiveStrategyContext {
  const candles = normalizeCandles(input);
  if (candles.length < defensiveRuleConfig.smaLongDays + 1) {
    throw new Error(`At least ${defensiveRuleConfig.smaLongDays + 1} completed daily candles are required.`);
  }
  const closes = candles.map((item) => new Decimal(item.close));
  return {
    candles,
    snapshots: candles.map((_, index) =>
      index < defensiveRuleConfig.smaLongDays
        ? undefined
        : indicatorSnapshot(candles, closes, index),
    ),
  };
}

export function evaluateDefensiveSignalAt(
  context: DefensiveStrategyContext,
  latestIndex: number,
  state: DefensiveStrategyState,
): DefensiveSignalDecision {
  const { candles, snapshots } = context;
  if (latestIndex < defensiveRuleConfig.smaLongDays || latestIndex >= candles.length) {
    throw new Error("The requested strategy date does not have a complete indicator window.");
  }
  const snapshot = snapshots[latestIndex]!;
  const riskOnStreak = trailingStreak(snapshots, latestIndex, (value) => value.riskOn, defensiveRuleConfig.hardExitRecoveryDays);
  const riskOffStreak = trailingStreak(snapshots, latestIndex, (value) => value.riskOff, defensiveRuleConfig.sellConfirmationDays);
  const previousTarget = new Decimal(state.modelAllocationPct || 0);
  const hardExit = snapshot.hardExit;
  const recovering = Boolean(state.recoveringFromHardExit || hardExit);
  const daysSinceChange = state.lastModelChangeDate
    ? daysBetween(state.lastModelChangeDate, candles[latestIndex].date)
    : Number.POSITIVE_INFINITY;
  let target = previousTarget;

  if (hardExit) {
    target = new Decimal(0);
  } else if (recovering) {
    if (
      riskOnStreak >= defensiveRuleConfig.hardExitRecoveryDays &&
      daysSinceChange >= defensiveRuleConfig.buyCooldownDays
    ) {
      target = Decimal.min(
        defensiveRuleConfig.maximumAllocationPct,
        previousTarget.add(defensiveRuleConfig.positionStepPct),
      );
    }
  } else if (
    riskOnStreak >= defensiveRuleConfig.buyConfirmationDays &&
    daysSinceChange >= defensiveRuleConfig.buyCooldownDays
  ) {
    target = Decimal.min(
      defensiveRuleConfig.maximumAllocationPct,
      previousTarget.add(defensiveRuleConfig.positionStepPct),
    );
  } else if (
    riskOffStreak >= defensiveRuleConfig.sellConfirmationDays &&
    daysSinceChange >= 1
  ) {
    target = Decimal.max(0, previousTarget.sub(defensiveRuleConfig.positionStepPct));
  }

  const delta = target.sub(previousTarget);
  const action: SignalAction = delta.gt(0) ? "BUY" : delta.lt(0) ? "SELL" : "WATCH";
  const recoveringFromHardExit = hardExit
    ? true
    : recovering && !(action === "BUY" && target.gt(0));

  return {
    action,
    targetAllocationPct: target.toFixed(2),
    deltaAllocationPct: delta.toFixed(2),
    agreementPct: new Decimal(snapshot.passedPredicates).div(5).mul(100).toFixed(2),
    hardExit,
    recoveringFromHardExit,
    riskOnStreak,
    riskOffStreak,
    summary: hardExit
      ? previousTarget.gt(0)
        ? "A documented hard-risk trigger reduced the BTC model target to 0%."
        : "A documented hard-risk trigger keeps the BTC model target at 0%."
      : action === "BUY"
        ? `All defensive risk-on checks remained confirmed; the model target increased by ${defensiveRuleConfig.positionStepPct} points.`
        : action === "SELL"
          ? `Multiple defensive checks remained weak; the model target decreased by ${defensiveRuleConfig.positionStepPct} points.`
          : recoveringFromHardExit
            ? `The model remains in hard-exit recovery until ${defensiveRuleConfig.hardExitRecoveryDays} consecutive risk-on closes complete.`
            : "The evidence did not justify changing the current model allocation.",
    metrics: snapshot.metrics,
    evidence: snapshot.evidence,
  };
}

function indicatorSnapshot(candles: StrategyCandle[], closes: Decimal[], index: number) {
  if (index < defensiveRuleConfig.smaLongDays) {
    throw new Error("The indicator window is incomplete.");
  }
  const close = closes[index];
  const sma50 = average(closes.slice(index - defensiveRuleConfig.smaMediumDays + 1, index + 1));
  const sma200 = average(closes.slice(index - defensiveRuleConfig.smaLongDays + 1, index + 1));
  const return1d = percentReturn(close, closes[index - 1]);
  const return90d = percentReturn(close, closes[index - defensiveRuleConfig.momentumShortDays]);
  const return180d = percentReturn(close, closes[index - defensiveRuleConfig.momentumLongDays]);
  const volatility30d = realizedVolatility(
    closes.slice(index - defensiveRuleConfig.volatilityDays, index + 1),
  );
  const trailing = closes.slice(index - defensiveRuleConfig.trailingDrawdownDays + 1, index + 1);
  const drawdown20d = close.div(Decimal.max(...trailing)).sub(1).mul(100);
  const distanceFromSma200 = close.div(sma200).sub(1).mul(100);
  const predicateValues = [
    close.gt(sma200),
    sma50.gt(sma200),
    return90d.gt(0),
    return180d.gt(0),
    volatility30d.lt(defensiveRuleConfig.volatilityRiskOnMaxPct),
  ];
  const failedTrendPredicates = predicateValues.slice(0, 4).filter((value) => !value).length;
  const riskOn = predicateValues.every(Boolean);
  const riskOff =
    failedTrendPredicates >= 2 ||
    volatility30d.gte(defensiveRuleConfig.volatilityRiskOnMaxPct);
  const hardExit =
    distanceFromSma200.lte(defensiveRuleConfig.longTrendHardExitGapPct) ||
    drawdown20d.lte(defensiveRuleConfig.trailingDrawdownHardExitPct) ||
    return1d.lte(defensiveRuleConfig.dailyReturnHardExitPct) ||
    volatility30d.gte(defensiveRuleConfig.volatilityHardExitPct);
  const metrics: DefensiveMetrics = {
    close: close.toFixed(2),
    sma50: sma50.toFixed(2),
    sma200: sma200.toFixed(2),
    return1dPct: return1d.toFixed(2),
    return90dPct: return90d.toFixed(2),
    return180dPct: return180d.toFixed(2),
    volatility30dPct: volatility30d.toFixed(2),
    drawdown20dPct: drawdown20d.toFixed(2),
    distanceFromSma200Pct: distanceFromSma200.toFixed(2),
  };
  const evidenceRows: DefensiveEvidence[] = [
    makeEvidence("price_sma200", "Long-term trend", predicateValues[0], `${metrics.close} / ${metrics.sma200}`, "Close > SMA200"),
    makeEvidence("sma50_sma200", "Trend confirmation", predicateValues[1], `${metrics.sma50} / ${metrics.sma200}`, "SMA50 > SMA200"),
    makeEvidence("return_90d", "90-day momentum", predicateValues[2], `${metrics.return90dPct}%`, "Return > 0%"),
    makeEvidence("return_180d", "180-day momentum", predicateValues[3], `${metrics.return180dPct}%`, "Return > 0%"),
    makeEvidence("volatility_30d", "Volatility control", predicateValues[4], `${metrics.volatility30dPct}%`, "Volatility < 80%"),
  ];
  return {
    riskOn,
    riskOff,
    hardExit,
    passedPredicates: predicateValues.filter(Boolean).length,
    metrics,
    evidence: evidenceRows,
  };
}

function trailingStreak(
  snapshots: Array<IndicatorSnapshot | undefined>,
  index: number,
  predicate: (snapshot: IndicatorSnapshot) => boolean,
  maximum: number,
) {
  let streak = 0;
  for (let cursor = index; cursor >= defensiveRuleConfig.smaLongDays && streak < maximum; cursor -= 1) {
    const snapshot = snapshots[cursor];
    if (!snapshot || !predicate(snapshot)) break;
    streak += 1;
  }
  return streak;
}

function makeEvidence(
  key: string,
  label: string,
  passed: boolean,
  value: string,
  threshold: string,
): DefensiveEvidence {
  return {
    key,
    label,
    passed,
    value,
    threshold,
    interpretation: passed
      ? `${label} satisfies the frozen defensive rule.`
      : `${label} does not satisfy the frozen defensive rule.`,
  };
}

function normalizeCandles(candles: StrategyCandle[]) {
  const byDate = new Map<string, StrategyCandle>();
  for (const candle of candles) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(candle.date)) throw new Error("Candle dates must be ISO dates.");
    const open = new Decimal(candle.open);
    const high = new Decimal(candle.high);
    const low = new Decimal(candle.low);
    const close = new Decimal(candle.close);
    if (!open.gt(0) || !high.gt(0) || !low.gt(0) || !close.gt(0) || high.lt(Decimal.max(open, close)) || low.gt(Decimal.min(open, close))) {
      throw new Error(`Invalid OHLC candle for ${candle.date}.`);
    }
    byDate.set(candle.date, candle);
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function average(values: Decimal[]) {
  return values.reduce((sum, value) => sum.add(value), new Decimal(0)).div(values.length);
}

function percentReturn(current: Decimal, previous: Decimal) {
  return current.div(previous).sub(1).mul(100);
}

function realizedVolatility(values: Decimal[]) {
  const returns = values.slice(1).map((value, index) => value.div(values[index]).ln());
  const mean = average(returns);
  const variance = average(returns.map((value) => value.sub(mean).pow(2)));
  return variance.sqrt().mul(new Decimal(365).sqrt()).mul(100);
}

function daysBetween(left: string, right: string) {
  return Math.max(0, Math.floor((Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)) / 86_400_000));
}
