import Decimal from "decimal.js";
import { calculatePortfolio, calculateSpending } from "@/lib/calculations";
import { defensiveRuleVersion } from "@/lib/btc-defensive-strategy";
import { btcResearchRuleVersion } from "@/lib/btc-research-rule";
import { formatMoney, formatPct, monthKey, previousMonth } from "@/lib/format";
import type {
  AssistantToolName,
  BtcSignal,
  Freshness,
  FxRate,
  MarketPrice,
  PortfolioTransaction,
  SourceReceipt,
  SpendingTransaction,
  TokenFlowEvent,
} from "@/lib/types";

export interface AssistantContext {
  transactions: PortfolioTransaction[];
  spending: SpendingTransaction[];
  prices: MarketPrice[];
  signals: BtcSignal[];
  events: TokenFlowEvent[];
  fxRates?: FxRate[];
}

export interface AssistantReply {
  content: string;
  toolName: AssistantToolName;
  sources: SourceReceipt[];
  investmentRelated: boolean;
}

function receipt(
  label: string,
  observedAt: string,
  kind: SourceReceipt["kind"],
  freshness: Freshness = "FRESH",
  period = "As of latest persisted snapshot",
): SourceReceipt {
  return {
    label,
    period,
    freshness,
    observedAt,
    kind,
  };
}

export function buildAssistantReply(question: string, context: AssistantContext): AssistantReply {
  const normalized = question.toLowerCase();
  const portfolio = calculatePortfolio(context.transactions, context.prices);
  const defensiveSignal = context.signals.find(
    (item) => item.ruleVersion === defensiveRuleVersion,
  );
  const researchSignal = context.signals.find(
    (item) => item.ruleVersion === btcResearchRuleVersion,
  );
  const now = new Date().toISOString();
  const latestPrice = context.prices
    .map((price) => price.observedAt)
    .sort()
    .at(-1) ?? now;
  const marketFreshness = aggregateFreshness(context.prices.map((price) => price.freshness));
  const requestedAsset = mentionedAsset(
    normalized,
    portfolio.holdings.flatMap((holding) => [holding.assetSymbol, holding.name]),
  );
  const requestedHolding = portfolio.holdings.find((holding) =>
    holding.assetSymbol === requestedAsset ||
    holding.name.toLowerCase() === requestedAsset?.toLowerCase(),
  );
  const btcSignalIntent = /signal|defensive|model target|target allocation|shadow|validated|\bwatch\b|research verdict|buy or sell|should i (?:buy|sell)|\bentry\b|\bexit\b|outlook|momentum|\brsi\b|technical trend/.test(normalized);

  if (/expense|spend|spending|spent|saving|savings|income|cash flow|budget|category/.test(normalized)) {
    const currentMonth = monthKey();
    const asksForPreviousMonth = /last month|previous month|prior month/.test(normalized);
    const currentSpending = calculateSpending(context.spending, currentMonth, context.fxRates);
    const spending = asksForPreviousMonth
      ? calculateSpending(context.spending, previousMonth(currentMonth), context.fxRates)
      : currentSpending;
    const category = spending.byCategory.find((item) =>
      new RegExp(`(^|\\W)${escapeRegExp(item.category)}($|\\W)`, "i").test(question),
    );
    if (category) {
      const share = new Decimal(spending.expensesUsd).gt(0)
        ? new Decimal(category.amountUsd).div(spending.expensesUsd).mul(100).toString()
        : "0";
      return {
        content: `${category.category} spending ${asksForPreviousMonth ? "last month" : "this month"} is ${formatMoney(category.amountUsd)}, or ${formatPct(share)} of ${formatMoney(spending.expensesUsd)} total recorded expenses.`,
        toolName: "getSpendingSummary",
        sources: [receipt("Normalized spending ledger", now, "CALCULATED", "FRESH", `Month ${spending.month}`)],
        investmentRelated: false,
      };
    }
    if (asksForPreviousMonth) {
      return {
        content: `Last month you recorded ${formatMoney(spending.expensesUsd)} in expenses against ${formatMoney(spending.incomeUsd)} in income, leaving ${formatMoney(spending.savingsUsd)}. This month expenses are ${formatPct(currentSpending.expenseChangePct, true)} versus that period.`,
        toolName: "getSpendingSummary",
        sources: [receipt("Normalized spending ledger", now, "CALCULATED", "FRESH", `Month ${spending.month}`)],
        investmentRelated: false,
      };
    }
    if (/budget/.test(normalized)) {
      return {
        content: `No explicit spending budget is stored, so I cannot determine whether you are over budget. This month you recorded ${formatMoney(spending.expensesUsd)} in expenses against ${formatMoney(spending.incomeUsd)} in income, leaving ${formatMoney(spending.savingsUsd)} (${formatPct(spending.savingsRatePct)} savings rate).`,
        toolName: "getSpendingSummary",
        sources: [receipt("Normalized spending ledger", now, "CALCULATED", "FRESH", `Month ${spending.month}`)],
        investmentRelated: false,
      };
    }
    return {
      content: `This month you recorded ${formatMoney(spending.expensesUsd)} in expenses against ${formatMoney(spending.incomeUsd)} in income, leaving ${formatMoney(spending.savingsUsd)} (${formatPct(spending.savingsRatePct)} savings rate). Expenses are ${formatPct(spending.expenseChangePct, true)} versus last month.`,
      toolName: "getSpendingSummary",
      sources: [receipt("Normalized spending ledger", now, "CALCULATED", "FRESH", `Month ${spending.month}`)],
      investmentRelated: false,
    };
  }

  if (/\b(?:smart|wallets?|late|tokens?|flows?|whales?)\b/.test(normalized) && !btcSignalIntent) {
    const event = context.events[0];
    if (!event) {
      return {
        content:
          "No smart-money events are available for your monitored public wallets. Add a public wallet and run wallet ingestion before drawing conclusions from public flows.",
        toolName: "getSmartMoneyEvents",
        sources: [receipt("Smart-money data-quality check", now, "CALCULATED", "MISSING", "Latest 24-hour wallet window")],
        investmentRelated: true,
      };
    }
    const eventFreshness = freshnessFromTimestamp(event.evaluatedAt);
    return {
      content: `The highest-priority observed event is ${event.tokenSymbol} on ${event.chain}, labeled ${event.entryStatus}. ${event.qualifiedWalletCount} qualified public-wallet proxies net-bought about ${formatMoney(event.netBuyUsd, "USD", undefined, true)}, while price moved ${formatPct(event.priceChangePct)} since first detection. Key risk: ${event.riskFactors[0] ?? "Wallet identity and intent are not independently verified."} This is a public-wallet proxy, not proof of institutional or insider activity.`,
      toolName: "getSmartMoneyEvents",
      sources: [receipt("Public-wallet events + DEX market snapshot", event.evaluatedAt, "INFERRED", eventFreshness, "Latest 24-hour wallet window")],
      investmentRelated: true,
    };
  }

  if (
    btcSignalIntent &&
    !/transaction|ledger|trade history|bought|sold|when did i/.test(normalized)
  ) {
    const asksForDefensiveModel = /defensive|model target|target allocation|shadow|validated/.test(
      normalized,
    );
    const signal = asksForDefensiveModel
      ? defensiveSignal
      : defensiveSignal?.mode === "VALIDATED"
        ? defensiveSignal
        : researchSignal ?? defensiveSignal;
    if (!signal) {
      return {
        content:
          `No current ${btcResearchRuleVersion} research evaluation or ${defensiveRuleVersion} defensive evaluation is available yet. The daily job needs two agreeing completed-candle sources before it can publish a current BTC verdict.`,
        toolName: "getBtcSignalExplanation",
        sources: [receipt("BTC signal data-quality check", now, "CALCULATED", "MISSING", "Latest completed UTC daily candle")],
        investmentRelated: true,
      };
    }
    const includeExposure = Boolean(
      requestedHolding && /allocation|exposure|portfolio|own|holding|position/.test(normalized),
    );
    const exposurePrefix = includeExposure && requestedHolding
      ? `Your tracked ${requestedHolding.assetSymbol} position is ${requestedHolding.quantity} units worth ${formatMoney(requestedHolding.currentValueUsd)}, or ${formatPct(requestedHolding.allocationPct)} of current portfolio value. `
      : "";
    const exposureReceipt = includeExposure && requestedHolding
      ? [receipt(`${requestedHolding.assetSymbol} ledger + market snapshot`, latestPrice, "CALCULATED", marketFreshness)]
      : [];
    if (signal.availability === "HALTED") {
      return {
        content: exposurePrefix + (signal.mode === "RESEARCH"
          ? `The ${signal.ruleVersion} BTC research evaluation is HALTED, so it does not publish a directional verdict. ${signal.summary} Independent completed-candle sources must agree before research resumes.`
          : `The ${signal.ruleVersion} BTC evaluation is HALTED, so it does not provide a BUY or SELL instruction. ${signal.summary} The model target remains ${signal.targetAllocationPct}% until independent completed-candle sources agree again.`),
        toolName: "getBtcSignalExplanation",
        sources: [...exposureReceipt, ...signal.evidence.slice(0, 3).map((item) => receipt(item.source, item.observedAt, item.kind, signal.freshness, "Latest completed UTC daily candle"))],
        investmentRelated: true,
      };
    }
    const orderedEvidence = signal.evidence.slice().sort((left, right) => Number(right.score) - Number(left.score));
    const strongest = orderedEvidence[0];
    const constraint = orderedEvidence.at(-1);
    const walletContext = signal.evidence.find((item) => item.group === "Public-wallet context");
    const institutionalContext = signal.evidence.find(
      (item) => item.group === "CFTC institutional positioning",
    );
    if (signal.mode === "RESEARCH") {
      return {
        content: `${exposurePrefix}BTC research is currently ${signal.action} under ${signal.ruleVersion}, with a ${signal.compositeScore}/100 weighted evidence score and ${signal.agreementPct}% completed-candle source agreement. ${signal.summary}${institutionalContext ? ` CFTC institutional context: ${institutionalContext.value}.` : ""}${walletContext ? ` Wallet context: ${walletContext.value}.` : ""}${strongest ? ` Strongest factor: ${strongest.group.toLowerCase()}.` : ""}${constraint ? ` Main constraint: ${constraint.group.toLowerCase()}.` : ""} This research verdict is not a validated win probability, target allocation, or trade instruction.`,
        toolName: "getBtcSignalExplanation",
        sources: [...exposureReceipt, ...signal.evidence.slice(0, 4).map((item) => receipt(item.source, item.observedAt, item.kind, signal.freshness, "Latest completed UTC daily candle"))],
        investmentRelated: true,
      };
    }
    const modeNote = signal.mode === "VALIDATED"
      ? "The signal is in validated mode."
      : `The signal is ${signal.mode.toLowerCase()}-only and is not actionable.`;
    return {
      content: `${exposurePrefix}BTC is currently ${signal.action} under ${signal.ruleVersion}, with a ${signal.targetAllocationPct}% model target, a ${signal.deltaAllocationPct}-point change, and ${signal.agreementPct}% rule agreement. ${signal.summary} ${modeNote}${strongest ? ` Strongest check: ${strongest.group.toLowerCase()}.` : ""}${constraint ? ` Main constraint: ${constraint.group.toLowerCase()}.` : ""} Rule agreement is evidence coverage, not a win probability.`,
      toolName: "getBtcSignalExplanation",
      sources: [...exposureReceipt, ...signal.evidence.slice(0, 3).map((item) => receipt(item.source, item.observedAt, item.kind, signal.freshness, "Latest completed UTC daily candle"))],
      investmentRelated: true,
    };
  }

  if (/quality|fix|missing|stale|trust/.test(normalized)) {
    const incompleteAssets = portfolio.holdings
      .filter((holding) => holding.incompleteBasis)
      .map((holding) => holding.assetSymbol);
    const pricedAssets = new Set(context.prices.map((price) => price.assetSymbol));
    const missingPrices = [...new Set(context.transactions.map((transaction) => transaction.assetSymbol))]
      .filter((symbol) => !pricedAssets.has(symbol));
    const issues = [
      incompleteAssets.length
        ? `Incomplete acquisition basis affects ${incompleteAssets.join(", ")}. Add the missing execution or acquisition value before trusting cost basis and P&L.`
        : undefined,
      missingPrices.length
        ? `No persisted market price is available for ${missingPrices.join(", ")}. Current value and allocation are incomplete.`
        : undefined,
      marketFreshness !== "FRESH"
        ? `Portfolio market freshness is ${marketFreshness}; refresh market snapshots before using current valuations.`
        : undefined,
    ].filter((item): item is string => Boolean(item));
    const requestedAssetContext = requestedHolding
      ? `${requestedHolding.assetSymbol} is ${formatPct(requestedHolding.allocationPct)} of tracked current value (${formatMoney(requestedHolding.currentValueUsd)}), while all other holdings total ${formatMoney(Decimal.max(0, new Decimal(portfolio.totalValueUsd).sub(requestedHolding.currentValueUsd)).toString())}. `
      : "";
    return {
      content: requestedAssetContext + (issues.length
        ? issues.join(" ")
        : "No incomplete cost basis, missing asset price, or stale portfolio market snapshot is currently detected. Review the timestamped receipt before relying on current valuations."),
      toolName: "getDataQualityReport",
      sources: [receipt("Portfolio ledger quality scan", latestPrice, "CALCULATED", marketFreshness)],
      investmentRelated: false,
    };
  }

  if (/transaction|ledger|trade history|bought|sold|when did i|last (?:buy|sell|trade)|latest (?:buy|sell|trade)|fees?\b|\b(?:buy|sell)\b/.test(normalized)) {
    const asset = mentionedAsset(normalized, context.transactions.map((transaction) => transaction.assetSymbol));
    const transactions = context.transactions
      .filter((transaction) => !asset || transaction.assetSymbol === asset)
      .slice()
      .sort((left, right) => right.executedAt.localeCompare(left.executedAt));
    if (/fees?\b/.test(normalized)) {
      const totalFees = transactions.reduce(
        (total, transaction) => total.add(transaction.feeUsd),
        new Decimal(0),
      );
      return {
        content: `${asset ? `${asset} recorded fees` : "Recorded portfolio transaction fees"} total ${formatMoney(totalFees.toString())} across ${transactions.length} matching transaction${transactions.length === 1 ? "" : "s"}. This is ledger fee data only and does not estimate taxes, spreads, or unrecorded network costs.`,
        toolName: "getTransactions",
        sources: [receipt("Authenticated portfolio ledger", now, "CALCULATED", "FRESH", "All matching persisted transactions")],
        investmentRelated: false,
      };
    }
    const aggregateDirection = /\b(?:buy|bought)\b/.test(normalized)
      ? "BUY"
      : /\b(?:sell|sold)\b/.test(normalized)
        ? "SELL"
        : undefined;
    if (aggregateDirection && /how much|total|aggregate|sum/.test(normalized)) {
      const matching = transactions.filter(
        (transaction) => transaction.transactionType === aggregateDirection,
      );
      const byAsset = new Map<string, { quantity: Decimal; notional: Decimal; fees: Decimal }>();
      for (const transaction of matching) {
        const current = byAsset.get(transaction.assetSymbol) ?? {
          quantity: new Decimal(0),
          notional: new Decimal(0),
          fees: new Decimal(0),
        };
        current.quantity = current.quantity.add(transaction.quantity);
        current.notional = current.notional.add(
          new Decimal(transaction.quantity).mul(transaction.unitPriceUsd),
        );
        current.fees = current.fees.add(transaction.feeUsd);
        byAsset.set(transaction.assetSymbol, current);
      }
      const summary = [...byAsset.entries()].map(([symbol, totals]) =>
        `${totals.quantity.toString()} ${symbol} for ${formatMoney(totals.notional.toString())} before ${formatMoney(totals.fees.toString())} in recorded fees`,
      );
      return {
        content: summary.length
          ? `Your ledger contains ${matching.length} ${aggregateDirection} transaction${matching.length === 1 ? "" : "s"}: ${summary.join("; ")}. These are execution totals, not current cost basis or proceeds after tax.`
          : `No ${asset ? `${asset} ` : ""}${aggregateDirection} transactions match that request.`,
        toolName: "getTransactions",
        sources: [receipt("Authenticated portfolio ledger", now, "CALCULATED", "FRESH", "All matching persisted transactions")],
        investmentRelated: false,
      };
    }
    const recent = transactions.slice(0, 5);
    if (/\b(?:last|latest|most recent)\b/.test(normalized)) {
      const latest = recent[0];
      return {
        content: latest
          ? `Your latest matching transaction is ${latest.transactionType} ${latest.quantity} ${latest.assetSymbol} at ${formatMoney(latest.unitPriceUsd)} on ${latest.executedAt.slice(0, 10)}, with ${formatMoney(latest.feeUsd)} in recorded fees at ${latest.venue}.`
          : `No ${asset ? `${asset} ` : ""}transactions match that request.`,
        toolName: "getTransactions",
        sources: [receipt("Authenticated portfolio ledger", now, "OBSERVED", "FRESH", "Latest matching persisted transaction")],
        investmentRelated: false,
      };
    }
    return {
      content: recent.length
        ? `${asset ? `${asset} has` : "Your ledger has"} ${transactions.length} matching transaction${transactions.length === 1 ? "" : "s"}. Latest entries: ${recent.map((item) => `${item.transactionType} ${item.quantity} ${item.assetSymbol} at ${formatMoney(item.unitPriceUsd)} on ${item.executedAt.slice(0, 10)}`).join("; ")}.`
        : `No ${asset ? `${asset} ` : ""}transactions match that request.`,
      toolName: "getTransactions",
      sources: [receipt("Authenticated portfolio ledger", now, "OBSERVED", "FRESH", "All matching persisted transactions")],
      investmentRelated: false,
    };
  }

  const scenarioShock = parseScenarioShock(normalized);
  if (requestedHolding && scenarioShock) {
    const currentValue = new Decimal(requestedHolding.currentValueUsd);
    const portfolioValue = new Decimal(portfolio.totalValueUsd);
    const valueChange = currentValue.mul(scenarioShock).div(100);
    const projectedHoldingValue = Decimal.max(0, currentValue.add(valueChange));
    const projectedPortfolioValue = Decimal.max(0, portfolioValue.add(valueChange));
    const projectedAllocation = projectedPortfolioValue.gt(0)
      ? projectedHoldingValue.div(projectedPortfolioValue).mul(100)
      : new Decimal(0);
    return {
      content: `In a simple ${signedPercent(scenarioShock)} ${requestedHolding.assetSymbol}-only price scenario, with every other holding unchanged, the position changes by ${formatMoney(valueChange.toString())} to ${formatMoney(projectedHoldingValue.toString())}. Tracked portfolio value becomes about ${formatMoney(projectedPortfolioValue.toString())}, and ${requestedHolding.assetSymbol} becomes ${projectedAllocation.toFixed(2)}% of it. This excludes fees, taxes, slippage, and correlations between assets.`,
      toolName: "getAssetPerformance",
      sources: [receipt(`${requestedHolding.assetSymbol} ledger + market snapshot scenario`, latestPrice, "CALCULATED", marketFreshness)],
      investmentRelated: true,
    };
  }

  if (/\brealized\b/.test(normalized) && !/\bunrealized\b/.test(normalized)) {
    return {
      content: `Your ledger-calculated realized P&L is ${formatMoney(portfolio.realizedPnlUsd)}. Current unrealized P&L is ${formatMoney(portfolio.unrealizedPnlUsd)} on ${formatMoney(portfolio.totalValueUsd)} of tracked value.${portfolio.incompleteBasis ? " Incomplete acquisition basis still makes parts of the portfolio record provisional." : ""}`,
      toolName: "getPortfolioSummary",
      sources: [receipt("Portfolio ledger realized P&L", latestPrice, "CALCULATED", marketFreshness)],
      investmentRelated: true,
    };
  }

  if (/cost basis|how much (?:have )?i invested|total invested|overall return|total return|\broi\b/.test(normalized) && !requestedHolding) {
    const costBasis = new Decimal(portfolio.totalCostBasisUsd);
    const unrealizedReturnPct = costBasis.gt(0)
      ? new Decimal(portfolio.unrealizedPnlUsd).div(costBasis).mul(100).toString()
      : "0";
    return {
      content: `Your open holdings have ${formatMoney(portfolio.totalCostBasisUsd)} of recorded cost basis and ${formatMoney(portfolio.totalValueUsd)} of current value, for ${formatMoney(portfolio.unrealizedPnlUsd)} in unrealized P&L (${formatPct(unrealizedReturnPct, true)} versus recorded basis). Realized P&L is ${formatMoney(portfolio.realizedPnlUsd)}.${portfolio.incompleteBasis ? " Incomplete acquisition basis means these figures are provisional." : ""}`,
      toolName: "getPortfolioSummary",
      sources: [receipt("Portfolio ledger + market snapshot", latestPrice, "CALCULATED", marketFreshness)],
      investmentRelated: true,
    };
  }

  if (/daily|today|24h|one.day/.test(normalized) && /change|move|perform(?:ance|ed)?|pnl|p&l|gain|loss/.test(normalized)) {
    const dailyChangePct = requestedHolding?.dailyChangePct ?? portfolio.dailyChangePct;
    const currentValue = requestedHolding?.currentValueUsd ?? portfolio.totalValueUsd;
    const dailyValueChange = new Decimal(currentValue)
      .mul(dailyChangePct)
      .div(100);
    return {
      content: requestedHolding
        ? `${requestedHolding.assetSymbol}'s latest provider daily move is ${formatPct(dailyChangePct, true)}, equivalent to approximately ${formatMoney(dailyValueChange.toString())} on the current ${formatMoney(currentValue)} position value. This is a snapshot estimate, not account-level time-weighted performance.`
        : `Using each tracked asset's latest daily market change, the portfolio's weighted one-day move is ${formatPct(dailyChangePct, true)}, or approximately ${formatMoney(dailyValueChange.toString())} on ${formatMoney(currentValue)} of current value. This is a snapshot estimate, not time-weighted account performance.`,
      toolName: requestedHolding ? "getAssetPerformance" : "getPortfolioSummary",
      sources: [receipt(requestedHolding ? `${requestedHolding.assetSymbol} ledger + latest market snapshot` : "Portfolio ledger + latest market snapshots", latestPrice, "CALCULATED", marketFreshness, "Latest provider daily-change window")],
      investmentRelated: true,
    };
  }

  if (requestedHolding) {
    const restOfPortfolio = Decimal.max(
      0,
      new Decimal(portfolio.totalValueUsd).sub(requestedHolding.currentValueUsd),
    );
    return {
      content: `${requestedHolding.assetSymbol} is ${formatPct(requestedHolding.allocationPct)} of the tracked portfolio: ${requestedHolding.quantity} units at ${formatMoney(requestedHolding.currentPriceUsd)} each, worth ${formatMoney(requestedHolding.currentValueUsd)} versus ${formatMoney(restOfPortfolio.toString())} in all other tracked holdings. Average cost is ${formatMoney(requestedHolding.averageCostUsd)}, cost basis is ${formatMoney(requestedHolding.costBasisUsd)}, and unrealized P&L is ${formatMoney(requestedHolding.unrealizedPnlUsd)}.${requestedHolding.incompleteBasis ? " Its acquisition basis is incomplete, so P&L is provisional." : ""}`,
      toolName: "getAssetPerformance",
      sources: [receipt(`${requestedHolding.assetSymbol} ledger + market snapshot`, latestPrice, "CALCULATED", marketFreshness)],
      investmentRelated: true,
    };
  }

  if (/highest|lowest|best|worst|winner|loser|performance|pnl|p&l|gain|profit|loss/.test(normalized)) {
    const ordered = portfolio.holdings
      .slice()
      .sort((a, b) => new Decimal(b.unrealizedPnlUsd).cmp(a.unrealizedPnlUsd));
    const asksForWorst = /lowest|worst|loser|biggest loss|most loss/.test(normalized);
    const ranked = asksForWorst ? ordered.at(-1) : ordered[0];
    const asksForRanked = /highest|lowest|best|worst|winner|loser|biggest (?:gain|profit|loss)|most (?:gain|profit|loss)/.test(normalized);
    return {
      content: ranked
        ? asksForRanked
          ? `${ranked.assetSymbol} has the ${asksForWorst ? "lowest" : "highest"} tracked unrealized P&L at ${formatMoney(ranked.unrealizedPnlUsd)}, based on ${formatMoney(ranked.currentValueUsd)} current value and ${formatMoney(ranked.costBasisUsd)} cost basis.`
          : `Tracked unrealized P&L is ${formatMoney(portfolio.unrealizedPnlUsd)} across ${portfolio.holdings.length} open holding${portfolio.holdings.length === 1 ? "" : "s"}: ${ordered.map((holding) => `${holding.assetSymbol} ${formatMoney(holding.unrealizedPnlUsd)}`).join("; ")}.${portfolio.incompleteBasis ? " Incomplete acquisition basis makes part of this provisional." : ""}`
        : "There are no holdings available to compare yet.",
      toolName: "getAssetPerformance",
      sources: [receipt("Portfolio ledger + market snapshot", latestPrice, "CALCULATED", marketFreshness)],
      investmentRelated: true,
    };
  }

  const btc = portfolio.holdings.find((holding) => holding.assetSymbol === "BTC");
  const concentration = btc && new Decimal(portfolio.totalValueUsd).gt(0)
    ? new Decimal(btc.currentValueUsd).div(portfolio.totalValueUsd).mul(100).toFixed(1)
    : "0.0";
  const largest = portfolio.holdings
    .slice()
    .sort((left, right) => new Decimal(right.allocationPct).cmp(left.allocationPct))[0];
  const concentrationAnswer = /concentrat|allocation|diversif|risk/.test(normalized);
  return {
    content: concentrationAnswer
      ? `BTC is ${concentration}% of tracked current value.${largest ? ` The largest position is ${largest.assetSymbol} at ${largest.allocationPct}%.` : ""} Whether that is too concentrated depends on your risk capacity and time horizon; the app can establish the exposure but not choose that limit for you.${portfolio.incompleteBasis ? " Incomplete acquisition basis makes the exact allocation or P&L provisional." : ""}`
      : `Your tracked portfolio is worth ${formatMoney(portfolio.totalValueUsd)}, with ${formatMoney(portfolio.unrealizedPnlUsd)} in unrealized P&L.${largest ? ` The largest position is ${largest.assetSymbol} at ${largest.allocationPct}% of current value.` : ""}${portfolio.incompleteBasis ? " Incomplete acquisition basis means P&L should be treated as provisional." : ""}`,
    toolName: "getPortfolioSummary",
    sources: [receipt("Portfolio ledger + market snapshot", latestPrice, "CALCULATED", marketFreshness)],
    investmentRelated: /portfolio|concentrat|allocation|risk|diversif/.test(normalized),
  };
}

function aggregateFreshness(values: Freshness[]): Freshness {
  if (!values.length) return "MISSING";
  const priority: Record<Freshness, number> = { FRESH: 0, DELAYED: 1, STALE: 2, MISSING: 3 };
  return values.reduce((worst, value) => priority[value] > priority[worst] ? value : worst, "FRESH");
}

function freshnessFromTimestamp(timestamp: string): Freshness {
  const ageMs = Date.now() - Date.parse(timestamp);
  if (!Number.isFinite(ageMs) || ageMs > 24 * 60 * 60 * 1000) return "STALE";
  if (ageMs > 60 * 60 * 1000) return "DELAYED";
  return "FRESH";
}

function mentionedAsset(question: string, candidates: string[]) {
  return candidates.find((candidate) => {
    const normalized = candidate.toLowerCase();
    return new RegExp(`(^|\\W)${escapeRegExp(normalized)}($|\\W)`, "i").test(question);
  });
}

function parseScenarioShock(question: string) {
  const directional = question.match(
    /\b(drops?|falls?|declines?|decreases?|crashes?|down|rises?|gains?|increases?|up)\b(?:\s+by)?\s+(\d+(?:\.\d+)?)\s*%/i,
  );
  if (directional) {
    const magnitude = new Decimal(directional[2]);
    const negative = /drop|fall|declin|decreas|crash|down/i.test(directional[1]);
    return negative ? Decimal.min(100, magnitude).neg() : Decimal.min(1000, magnitude);
  }
  const signed = question.match(/([+-]\d+(?:\.\d+)?)\s*%/);
  return signed ? new Decimal(signed[1]) : undefined;
}

function signedPercent(value: Decimal) {
  return `${value.gt(0) ? "+" : ""}${value.toDecimalPlaces(2).toString()}%`;
}

function escapeRegExp(value: string) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
