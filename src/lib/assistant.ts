import Decimal from "decimal.js";
import { calculatePortfolio, calculateSpending } from "@/lib/calculations";
import { formatMoney, formatPct, monthKey } from "@/lib/format";
import type {
  AssistantToolName,
  BtcSignal,
  FxRate,
  MarketPrice,
  PortfolioTransaction,
  SourceReceipt,
  SpendingTransaction,
  TokenFlowEvent,
} from "@/lib/types";

interface AssistantContext {
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

function receipt(label: string, observedAt: string, kind: SourceReceipt["kind"]): SourceReceipt {
  return {
    label,
    period: "As of latest persisted snapshot",
    freshness: "FRESH",
    observedAt,
    kind,
  };
}

export function buildAssistantReply(question: string, context: AssistantContext): AssistantReply {
  const normalized = question.toLowerCase();
  const portfolio = calculatePortfolio(context.transactions, context.prices);
  const signal = context.signals[0];
  const now = new Date().toISOString();
  const latestPrice = context.prices[0]?.observedAt ?? now;

  if (/expense|spending|spent|saving|category/.test(normalized)) {
    const spending = calculateSpending(context.spending, monthKey(), context.fxRates);
    return {
      content: `This month you recorded ${formatMoney(spending.expensesUsd)} in expenses against ${formatMoney(spending.incomeUsd)} in income, leaving ${formatMoney(spending.savingsUsd)} (${formatPct(spending.savingsRatePct)} savings rate). Expenses are ${formatPct(spending.expenseChangePct, true)} versus last month.`,
      toolName: "getSpendingSummary",
      sources: [receipt("Normalized spending ledger", now, "CALCULATED")],
      investmentRelated: false,
    };
  }

  if (/why|signal|btc|bitcoin|watch|buy|sell/.test(normalized)) {
    if (!signal) {
      return {
        content:
          "No BTC signal is available yet. Run the market synchronization job and verify that the required daily history is fresh before relying on a signal.",
        toolName: "getBtcSignalExplanation",
        sources: [receipt("Signal data-quality check", now, "CALCULATED")],
        investmentRelated: true,
      };
    }
    return {
      content: `BTC is currently ${signal.action} with a ${signal.compositeScore}/100 composite score and ${signal.confidencePct}% confidence. ${signal.summary} The strongest factor is ${signal.evidence.slice().sort((a, b) => Number(b.score) - Number(a.score))[0]?.group.toLowerCase()}, while ${signal.evidence.slice().sort((a, b) => Number(a.score) - Number(b.score))[0]?.group.toLowerCase()} is the largest constraint.`,
      toolName: "getBtcSignalExplanation",
      sources: signal.evidence.slice(0, 3).map((item) => receipt(item.source, item.observedAt, item.kind)),
      investmentRelated: true,
    };
  }

  if (/smart|wallet|late|token|flow|whale/.test(normalized)) {
    const event = context.events[0];
    if (!event) {
      return {
        content:
          "No smart-money events are available for your monitored wallets. Add a public wallet and run wallet ingestion before drawing conclusions from public flows.",
        toolName: "getSmartMoneyEvents",
        sources: [receipt("Smart-money data-quality check", now, "CALCULATED")],
        investmentRelated: true,
      };
    }
    return {
      content: `The highest-priority event is ${event.tokenSymbol} on ${event.chain}, labeled ${event.entryStatus}. ${event.qualifiedWalletCount} qualified wallets net-bought about ${formatMoney(event.netBuyUsd, "USD", undefined, true)}, but price has already moved ${formatPct(event.priceChangePct)} since first detection. Key risk: ${event.riskFactors[0]}.`,
      toolName: "getSmartMoneyEvents",
      sources: [receipt("Public-wallet proxy + DEX snapshots", event.evaluatedAt, "INFERRED")],
      investmentRelated: true,
    };
  }

  if (/quality|fix|missing|stale|trust/.test(normalized)) {
    return {
      content: portfolio.incompleteBasis
        ? "Your highest-priority data issue is an ETH reward with no acquisition value. Add its basis before relying on total cost basis or unrealized P&L. The latest market freshness is shown in the source receipt."
        : "No incomplete cost basis is currently detected. Review the timestamped market source receipt before relying on current valuations.",
      toolName: "getDataQualityReport",
      sources: [receipt("Portfolio ledger quality scan", latestPrice, "CALCULATED")],
      investmentRelated: false,
    };
  }

  if (/highest|best|performance|pnl|gain|profit/.test(normalized)) {
    const best = portfolio.holdings
      .slice()
      .sort((a, b) => new Decimal(b.unrealizedPnlUsd).cmp(a.unrealizedPnlUsd))[0];
    return {
      content: best
        ? `${best.assetSymbol} has the highest tracked unrealized P&L at ${formatMoney(best.unrealizedPnlUsd)}, based on ${formatMoney(best.currentValueUsd)} current value and ${formatMoney(best.costBasisUsd)} cost basis.`
        : "There are no holdings available to compare yet.",
      toolName: "getAssetPerformance",
      sources: [receipt("Portfolio ledger + market snapshot", latestPrice, "CALCULATED")],
      investmentRelated: true,
    };
  }

  const btc = portfolio.holdings.find((holding) => holding.assetSymbol === "BTC");
  const concentration = btc && new Decimal(portfolio.totalValueUsd).gt(0)
    ? new Decimal(btc.currentValueUsd).div(portfolio.totalValueUsd).mul(100).toFixed(1)
    : "0.0";
  return {
    content: `Your tracked portfolio is worth ${formatMoney(portfolio.totalValueUsd)}, with ${formatMoney(portfolio.unrealizedPnlUsd)} in unrealized P&L. BTC is the largest position at ${concentration}% of current value.${portfolio.incompleteBasis ? " One incomplete cost-basis record means P&L should be treated as provisional." : ""}`,
    toolName: "getPortfolioSummary",
    sources: [receipt("Portfolio ledger + market snapshot", latestPrice, "CALCULATED")],
    investmentRelated: /portfolio|concentrat|allocation|risk/.test(normalized),
  };
}
