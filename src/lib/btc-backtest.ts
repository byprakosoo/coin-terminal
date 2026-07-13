import Decimal from "decimal.js";
import type { DailyClose } from "@/server/signal-engine";
import { generateBtcSignal } from "@/server/signal-engine";

export interface BtcBacktestPoint {
  date: string;
  strategyUsd: string;
  buyHoldUsd: string;
  action: "BUY" | "SELL" | "WATCH";
  score: string;
}

export interface BtcBacktestResult {
  startedAt: string;
  endedAt: string;
  sourceDays: number;
  evaluatedDays: number;
  initialCapitalUsd: string;
  strategyReturnPct: string;
  buyHoldReturnPct: string;
  excessReturnPct: string;
  maxDrawdownPct: string;
  trades: number;
  resolvedTrades: number;
  openTrades: number;
  winRatePct?: string;
  buySignalDays: number;
  sellSignalDays: number;
  watchSignalDays: number;
  directionalCalls: number;
  directionalHitRatePct?: string;
  exposurePct: string;
  feeBps: number;
  execution: "NEXT_DAILY_CLOSE";
  walletContextScore: string;
  limitations: string[];
  equity: BtcBacktestPoint[];
}

export function backtestBtcSignal(
  closes: DailyClose[],
  options: {
    initialCapitalUsd?: string;
    feeBps?: number;
    forwardHitDays?: number;
    walletContextScore?: string;
  } = {},
): BtcBacktestResult {
  const sorted = [...closes].sort((left, right) => left.date.localeCompare(right.date));
  if (sorted.length < 60) throw new Error("At least 60 daily closes are required for the backtest.");

  const initialCapital = new Decimal(options.initialCapitalUsd ?? "10000");
  const feeBps = options.feeBps ?? 10;
  const feeMultiplier = new Decimal(1).sub(new Decimal(feeBps).div(10_000));
  const forwardHitDays = options.forwardHitDays ?? 7;
  const walletContextScore = options.walletContextScore ?? "50";
  const firstSignalIndex = 50;
  const benchmarkStart = new Decimal(sorted[firstSignalIndex].close);

  let equity = initialCapital;
  let peak = equity;
  let maxDrawdown = new Decimal(0);
  let invested = false;
  let investedDays = 0;
  let entries = 0;
  let resolvedTrades = 0;
  let winningTrades = 0;
  let entryPrice: Decimal | undefined;
  let directionalCalls = 0;
  let correctDirectionalCalls = 0;
  let buySignalDays = 0;
  let sellSignalDays = 0;
  let watchSignalDays = 0;
  const points: BtcBacktestPoint[] = [];

  for (let index = firstSignalIndex; index < sorted.length - 1; index += 1) {
    const current = new Decimal(sorted[index].close);
    const next = new Decimal(sorted[index + 1].close);

    if (invested) {
      equity = equity.mul(next.div(current));
      investedDays += 1;
    }

    const signal = generateBtcSignal(sorted.slice(0, index + 1), {
      now: sorted[index].observedAt,
      walletContextScore,
    });

    if (signal.action === "BUY") buySignalDays += 1;
    else if (signal.action === "SELL") sellSignalDays += 1;
    else watchSignalDays += 1;

    if (index + forwardHitDays < sorted.length && signal.action !== "WATCH") {
      directionalCalls += 1;
      const forwardReturn = new Decimal(sorted[index + forwardHitDays].close).div(current).sub(1);
      if (
        (signal.action === "BUY" && forwardReturn.gt(0)) ||
        (signal.action === "SELL" && forwardReturn.lt(0))
      ) {
        correctDirectionalCalls += 1;
      }
    }

    // The signal is known only after the current daily close, so position
    // changes are executed at the next close after that day's return.
    if (signal.action === "BUY" && !invested) {
      equity = equity.mul(feeMultiplier);
      invested = true;
      entryPrice = next;
      entries += 1;
    } else if (signal.action === "SELL" && invested) {
      equity = equity.mul(feeMultiplier);
      invested = false;
      resolvedTrades += 1;
      if (entryPrice && next.div(entryPrice).mul(feeMultiplier.pow(2)).gt(1)) winningTrades += 1;
      entryPrice = undefined;
    }

    peak = Decimal.max(peak, equity);
    maxDrawdown = Decimal.max(maxDrawdown, peak.sub(equity).div(peak).mul(100));
    const buyHoldEquity = initialCapital.mul(next.div(benchmarkStart));
    points.push({
      date: sorted[index + 1].date,
      strategyUsd: equity.toFixed(2),
      buyHoldUsd: buyHoldEquity.toFixed(2),
      action: signal.action,
      score: signal.compositeScore,
    });
  }

  const strategyReturn = equity.div(initialCapital).sub(1).mul(100);
  const finalBenchmark = new Decimal(sorted.at(-1)!.close);
  const buyHoldReturn = finalBenchmark.div(benchmarkStart).sub(1).mul(100);
  const evaluatedDays = sorted.length - firstSignalIndex - 1;

  return {
    startedAt: sorted[firstSignalIndex].date,
    endedAt: sorted.at(-1)!.date,
    sourceDays: sorted.length,
    evaluatedDays,
    initialCapitalUsd: initialCapital.toFixed(2),
    strategyReturnPct: strategyReturn.toFixed(2),
    buyHoldReturnPct: buyHoldReturn.toFixed(2),
    excessReturnPct: strategyReturn.sub(buyHoldReturn).toFixed(2),
    maxDrawdownPct: maxDrawdown.neg().toFixed(2),
    trades: entries,
    resolvedTrades,
    openTrades: invested ? 1 : 0,
    winRatePct: resolvedTrades
      ? new Decimal(winningTrades).div(resolvedTrades).mul(100).toFixed(2)
      : undefined,
    buySignalDays,
    sellSignalDays,
    watchSignalDays,
    directionalCalls,
    directionalHitRatePct: directionalCalls
      ? new Decimal(correctDirectionalCalls).div(directionalCalls).mul(100).toFixed(2)
      : undefined,
    exposurePct: new Decimal(investedDays).div(evaluatedDays).mul(100).toFixed(2),
    feeBps,
    execution: "NEXT_DAILY_CLOSE",
    walletContextScore,
    limitations: [
      "Uses daily closes, so intraday execution, spread, slippage, and taxes are not modeled.",
      `Includes ${feeBps} bps per position change and executes only at the next daily close.`,
      "Wallet context is held neutral at 50 until an attributed exchange-flow provider is configured and separately backtested.",
      "Past simulated performance does not predict future returns.",
    ],
    equity: points,
  };
}
