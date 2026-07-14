import Decimal from "decimal.js";
import {
  defensiveRuleConfig,
  buildDefensiveStrategyContext,
  evaluateDefensiveSignalAt,
  type DefensiveStrategyState,
  type StrategyCandle,
} from "@/lib/btc-defensive-strategy";

export interface DefensiveBacktestPoint {
  date: string;
  strategyUsd: string;
  btcBuyHoldUsd: string;
  balancedBuyHoldUsd: string;
  targetAllocationPct: string;
  action: "BUY" | "SELL" | "WATCH";
}

export interface PerformanceMetrics {
  returnPct: string;
  cagrPct: string;
  maxDrawdownPct: string;
  sortino: string;
  calmar: string;
}

export interface DefensiveBacktestResult {
  source: string;
  startedOn: string;
  endedOn: string;
  evaluatedDays: number;
  costBps: number;
  changes: number;
  hardExits: number;
  nonnegativeYearPct: string;
  downsideCapturePct: string;
  strategy: PerformanceMetrics;
  btcBuyHold: PerformanceMetrics;
  balancedBuyHold: PerformanceMetrics;
  yearly: Array<{ year: number; returnPct: string; maxDrawdownPct: string }>;
  equity: DefensiveBacktestPoint[];
}

export interface DefensiveHistoricalValidation {
  passed: boolean;
  failureReasons: string[];
  sourceResults: DefensiveBacktestResult[];
  stressResults: DefensiveBacktestResult[];
}

export function backtestDefensiveStrategy(
  source: string,
  input: StrategyCandle[],
  options: { initialCapitalUsd?: string; costBps?: number } = {},
): DefensiveBacktestResult {
  const candles = [...input].sort((left, right) => left.date.localeCompare(right.date));
  if (candles.length < 365) throw new Error("At least 365 daily candles are required for defensive backtesting.");
  const initialCapital = new Decimal(options.initialCapitalUsd ?? "10000");
  const costBps = options.costBps ?? defensiveRuleConfig.baseCostBps;
  const firstIndex = defensiveRuleConfig.smaLongDays;
  const firstExecution = new Decimal(candles[firstIndex + 1].executionPrice ?? candles[firstIndex + 1].open);
  let cash = initialCapital;
  let btc = new Decimal(0);
  const context = buildDefensiveStrategyContext(candles);
  let state: DefensiveStrategyState = { modelAllocationPct: "0" };
  let changes = 0;
  let hardExits = 0;
  const equity: DefensiveBacktestPoint[] = [];

  for (let index = firstIndex; index < candles.length - 1; index += 1) {
    const decision = evaluateDefensiveSignalAt(context, index, state);
    const next = candles[index + 1];
    const executionPrice = new Decimal(next.executionPrice ?? next.open);
    const preTradeEquity = cash.add(btc.mul(executionPrice));
    const targetValue = preTradeEquity.mul(decision.targetAllocationPct).div(100);
    const currentValue = btc.mul(executionPrice);
    const targetChanged = !new Decimal(decision.deltaAllocationPct).isZero();
    const tradeValue = targetChanged ? targetValue.sub(currentValue) : new Decimal(0);

    if (!tradeValue.isZero()) {
      const fee = tradeValue.abs().mul(costBps).div(10_000);
      cash = cash.sub(tradeValue).sub(fee);
      btc = btc.add(tradeValue.div(executionPrice));
      changes += 1;
      if (decision.hardExit) hardExits += 1;
    }

    const strategyValue = cash.add(btc.mul(next.close));
    const btcBuyHold = initialCapital.mul(new Decimal(next.close).div(firstExecution));
    const balancedBuyHold = initialCapital
      .mul("0.5")
      .add(initialCapital.mul("0.5").mul(new Decimal(next.close).div(firstExecution)));
    equity.push({
      date: next.date,
      strategyUsd: strategyValue.toFixed(2),
      btcBuyHoldUsd: btcBuyHold.toFixed(2),
      balancedBuyHoldUsd: balancedBuyHold.toFixed(2),
      targetAllocationPct: decision.targetAllocationPct,
      action: decision.action,
    });
    state = {
      modelAllocationPct: decision.targetAllocationPct,
      lastModelChangeDate: targetChanged ? next.date : state.lastModelChangeDate,
      recoveringFromHardExit: decision.recoveringFromHardExit,
    };
  }

  const strategyValues = equity.map((point) => new Decimal(point.strategyUsd));
  const btcValues = equity.map((point) => new Decimal(point.btcBuyHoldUsd));
  const balancedValues = equity.map((point) => new Decimal(point.balancedBuyHoldUsd));
  const yearly = yearlyMetrics(equity);
  const nonnegativeYears = yearly.filter((item) => new Decimal(item.returnPct).gte(0)).length;

  return {
    source,
    startedOn: equity[0].date,
    endedOn: equity.at(-1)!.date,
    evaluatedDays: equity.length,
    costBps,
    changes,
    hardExits,
    nonnegativeYearPct: new Decimal(nonnegativeYears).div(yearly.length || 1).mul(100).toFixed(2),
    downsideCapturePct: downsideCapture(strategyValues, btcValues).toFixed(2),
    strategy: performance(strategyValues, equity[0].date, equity.at(-1)!.date),
    btcBuyHold: performance(btcValues, equity[0].date, equity.at(-1)!.date),
    balancedBuyHold: performance(balancedValues, equity[0].date, equity.at(-1)!.date),
    yearly,
    equity,
  };
}

export function validateDefensiveHistory(
  datasets: Array<{ source: string; candles: StrategyCandle[] }>,
): DefensiveHistoricalValidation {
  const sourceResults = datasets.map(({ source, candles }) =>
    backtestDefensiveStrategy(source, candles, { costBps: defensiveRuleConfig.baseCostBps }),
  );
  const stressResults = datasets.map(({ source, candles }) =>
    backtestDefensiveStrategy(source, candles, { costBps: defensiveRuleConfig.stressCostBps }),
  );
  const failures: string[] = [];

  for (const result of sourceResults) {
    if (new Decimal(result.strategy.returnPct).lte(0)) failures.push(`${result.source}: aggregate net return is not positive.`);
    if (new Decimal(result.strategy.maxDrawdownPct).lt(-20)) failures.push(`${result.source}: aggregate drawdown exceeded 20%.`);
    const failedYear = result.yearly.find((year) => new Decimal(year.maxDrawdownPct).lt(-20));
    if (failedYear) failures.push(`${result.source}: ${failedYear.year} drawdown exceeded 20%.`);
    if (new Decimal(result.strategy.calmar).lte(result.balancedBuyHold.calmar)) failures.push(`${result.source}: Calmar did not beat the static 50/50 benchmark.`);
    if (new Decimal(result.strategy.sortino).lte(result.balancedBuyHold.sortino)) failures.push(`${result.source}: Sortino did not beat the static 50/50 benchmark.`);
    if (new Decimal(result.downsideCapturePct).gte(60)) failures.push(`${result.source}: downside capture was not below 60%.`);
    if (new Decimal(result.nonnegativeYearPct).lt(75)) failures.push(`${result.source}: fewer than 75% of yearly folds were nonnegative.`);
  }
  for (const result of stressResults) {
    if (new Decimal(result.strategy.maxDrawdownPct).lt(-20)) failures.push(`${result.source}: drawdown exceeded 20% under the 50 bps cost stress.`);
  }

  return {
    passed: failures.length === 0,
    failureReasons: [...new Set(failures)],
    sourceResults,
    stressResults,
  };
}

function performance(values: Decimal[], startedOn: string, endedOn: string): PerformanceMetrics {
  const first = values[0];
  const last = values.at(-1)!;
  const years = Math.max(1 / 365, (Date.parse(`${endedOn}T00:00:00Z`) - Date.parse(`${startedOn}T00:00:00Z`)) / (365.25 * 86_400_000));
  const totalReturn = last.div(first).sub(1);
  const cagr = last.div(first).pow(new Decimal(1).div(years)).sub(1);
  let peak = first;
  let maxDrawdown = new Decimal(0);
  for (const value of values) {
    peak = Decimal.max(peak, value);
    maxDrawdown = Decimal.min(maxDrawdown, value.div(peak).sub(1));
  }
  const returns = values.slice(1).map((value, index) => value.div(values[index]).sub(1));
  const mean = average(returns);
  const downside = returns.filter((value) => value.lt(0));
  const downsideDeviation = downside.length
    ? average(downside.map((value) => value.pow(2))).sqrt()
    : new Decimal(0);
  const sortino = downsideDeviation.isZero()
    ? new Decimal(0)
    : mean.div(downsideDeviation).mul(new Decimal(365).sqrt());
  const calmar = maxDrawdown.isZero() ? new Decimal(0) : cagr.div(maxDrawdown.abs());
  return {
    returnPct: totalReturn.mul(100).toFixed(2),
    cagrPct: cagr.mul(100).toFixed(2),
    maxDrawdownPct: maxDrawdown.mul(100).toFixed(2),
    sortino: sortino.toFixed(3),
    calmar: calmar.toFixed(3),
  };
}

function yearlyMetrics(points: DefensiveBacktestPoint[]) {
  const byYear = new Map<number, DefensiveBacktestPoint[]>();
  for (const point of points) {
    const year = Number(point.date.slice(0, 4));
    const list = byYear.get(year) ?? [];
    list.push(point);
    byYear.set(year, list);
  }
  return [...byYear.entries()].map(([year, rows]) => {
    const values = rows.map((row) => new Decimal(row.strategyUsd));
    let peak = values[0];
    let maxDrawdown = new Decimal(0);
    for (const value of values) {
      peak = Decimal.max(peak, value);
      maxDrawdown = Decimal.min(maxDrawdown, value.div(peak).sub(1));
    }
    return {
      year,
      returnPct: values.at(-1)!.div(values[0]).sub(1).mul(100).toFixed(2),
      maxDrawdownPct: maxDrawdown.mul(100).toFixed(2),
    };
  });
}

function downsideCapture(strategyValues: Decimal[], benchmarkValues: Decimal[]) {
  let strategyDown = new Decimal(0);
  let benchmarkDown = new Decimal(0);
  for (let index = 1; index < strategyValues.length; index += 1) {
    const benchmarkReturn = benchmarkValues[index].div(benchmarkValues[index - 1]).sub(1);
    if (benchmarkReturn.gte(0)) continue;
    benchmarkDown = benchmarkDown.add(benchmarkReturn);
    strategyDown = strategyDown.add(strategyValues[index].div(strategyValues[index - 1]).sub(1));
  }
  return benchmarkDown.isZero()
    ? new Decimal(0)
    : strategyDown.div(benchmarkDown).mul(100);
}

function average(values: Decimal[]) {
  if (!values.length) return new Decimal(0);
  return values.reduce((sum, value) => sum.add(value), new Decimal(0)).div(values.length);
}
