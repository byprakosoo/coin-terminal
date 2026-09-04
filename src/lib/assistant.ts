import Decimal from "decimal.js";
import { calculatePortfolio, calculateSpending } from "@/lib/calculations";
import { defensiveRuleVersion } from "@/lib/btc-defensive-strategy";
import { btcResearchRuleVersion } from "@/lib/btc-research-rule";
import { formatMoney as formatMoneyValue, formatNativeMoney, formatPct, monthKey, previousMonth } from "@/lib/format";
import type {
  Alert,
  AssistantToolName,
  BtcStrategyProfile,
  BtcSignal,
  Freshness,
  FxRate,
  DisplayCurrency,
  MarketPoint,
  MarketPrice,
  PortfolioTransaction,
  SourceReceipt,
  SpendingTransaction,
  TokenFlowEvent,
  WatchlistWallet,
} from "@/lib/types";
import type { PortfolioRecapSummary } from "@/features/portfolio-recap/types";

export interface AssistantContext {
  transactions: PortfolioTransaction[];
  spending: SpendingTransaction[];
  prices: MarketPrice[];
  signals: BtcSignal[];
  events: TokenFlowEvent[];
  fxRates?: FxRate[];
  displayCurrency?: DisplayCurrency;
  marketHistory?: MarketPoint[];
  wallets?: WatchlistWallet[];
  alerts?: Alert[];
  portfolioRecap?: PortfolioRecapSummary;
  strategyProfile?: BtcStrategyProfile;
  conversationHistory?: Array<{ role: "USER" | "ASSISTANT"; content: string }>;
}

export interface AssistantReply {
  content: string;
  toolName: AssistantToolName;
  sources: SourceReceipt[];
  investmentRelated: boolean;
}

export type AssistantQuestionIntent = "KEY_ACTION" | "TOTAL_PORTFOLIO_VALUE" | "GOAL_ALLOCATION" | "GENERAL";

export function isGoalAllocationQuestion(question: string) {
  const normalized = question.trim().toLowerCase();
  return /tujuan keuangan|financial goals?|goal.?based|pengalokasian|alokasi(?:kan|si)?\s+(?:berdasarkan\s+)?tujuan|daftar haji|\bhaji\b|dana pendidikan|pendidikan anak|beli mobil|car purchase|education fund/.test(normalized);
}

export function classifyAssistantQuestion(question: string, previousUserQuestion?: string): AssistantQuestionIntent {
  const normalized = question.trim().toLowerCase();
  const current = classifyCurrentQuestion(normalized);
  if (current !== "GENERAL") return current;
  if (previousUserQuestion && isLikelyFollowUpQuestion(normalized)) {
    return classifyCurrentQuestion(previousUserQuestion.toLowerCase());
  }
  return "GENERAL";
}

function classifyCurrentQuestion(normalized: string): AssistantQuestionIntent {
  if (isGoalAllocationQuestion(normalized)) {
    return "GOAL_ALLOCATION";
  }
  if (/key action|next action|next step|what should i do|what do i do|how should i use|what should .*\b(?:cash|money)\b|\b(?:cash|money)\b.*\b(?:do|use|invest)\b|langkah (?:utama|selanjutnya)|apa yang (?:harus|sebaiknya) saya lakukan|apa langkah|aksi utama|tindakan utama|sebaiknya .*\b(?:uang|dana|kas)\b|\b(?:uang|dana|kas)\b.*\b(?:dipakai|digunakan|diinvestasikan|diapakan)\b/.test(normalized)) {
    return "KEY_ACTION";
  }
  if (/total (?:portfolio )?(?:value|worth)|portfolio value|net worth|all assets|entire portfolio|total nilai|nilai total|nilai portofolio|nilai aset|total portofolio|kekayaan bersih|seluruh aset|semua aset|portofolio .*\b(?:bernilai|berapa|worth|value)\b|\b(?:what|how much|berapa)\b.*\b(?:portfolio|portofolio|aset)\b.*\b(?:worth|value|nilai|bernilai)\b/.test(normalized)) {
    return "TOTAL_PORTFOLIO_VALUE";
  }
  return "GENERAL";
}

export function isLikelyFollowUpQuestion(question: string) {
  const normalized = question.trim().toLowerCase();
  return /^(?:and|so|then)\b/.test(normalized) ||
    /^(?:what|how) about\b/.test(normalized) ||
    /^(?:what|how) (?:does|is) that\b/.test(normalized) ||
    /\b(?:it|that|those|they|there|same)\b/.test(normalized);
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
  const displayCurrency = context.displayCurrency ?? "USD";
  const formatMoney = (value: string | number, currency = displayCurrency, rates = context.fxRates, compact = false) =>
    formatMoneyValue(value, currency, rates, compact);
  const previousUserQuestion = context.conversationHistory?.filter((turn) => turn.role === "USER").at(-1)?.content;
  const normalizedQuestion = question.trim().toLowerCase();
  const normalized = previousUserQuestion && isLikelyFollowUpQuestion(normalizedQuestion)
    ? `${previousUserQuestion} ${question}`.toLowerCase()
    : normalizedQuestion;
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
  const btcSignalIntent = /signal|sinyal|defensive|model target|target allocation|shadow|validated|\bwatch\b|research verdict|buy or sell|should i (?:buy|sell)|\bentry\b|\bexit\b|outlook|momentum|\brsi\b|technical trend|tren|trend|arah btc|beli atau jual/.test(normalized);
  const questionIntent = classifyAssistantQuestion(question, previousUserQuestion);
  const goldIntent = /\bgold\b|emas|logam mulia|\bantam\b/.test(normalized);

  if (questionIntent === "KEY_ACTION") {
    const cashMention = question.match(/(?:[$€£]\s?\d[\d.,]*|Rp\.?\s?\d[\d.,]*|\d[\d.,]*\s?(?:usd|idr|dollar|rupiah|dolar))/i)?.[0]
      ?? previousUserQuestion?.match(/(?:[$€£]\s?\d[\d.,]*|Rp\.?\s?\d[\d.,]*|\d[\d.,]*\s?(?:usd|idr|dollar|rupiah|dolar))/i)?.[0]
      ?? "the stated cash";
    const latestSnapshot = context.portfolioRecap?.snapshots.at(-1);
    const qualityIssues = [
      portfolio.holdings.some((holding) => holding.incompleteBasis)
        ? "reconcile incomplete acquisition basis before relying on P&L"
        : undefined,
      context.prices.some((price) => price.freshness !== "FRESH")
        ? "refresh delayed or stale market prices"
        : undefined,
      !latestSnapshot
        ? "add an all-assets Monthly History snapshot"
        : undefined,
    ].filter((item): item is string => Boolean(item));
    const firstAction = latestSnapshot
      ? `First, reconcile whether ${cashMention} is already included in the Bank/cash line of your latest Monthly History snapshot dated ${latestSnapshot.asOfDate}.`
      : `First, record whether ${cashMention} belongs to your cash reserve or investable balance; there is no all-assets Monthly History snapshot to reconcile it against yet.`;
    const dataAction = qualityIssues.length
      ? `Then ${qualityIssues.join(", then ")}.`
      : "The current data scan does not flag an incomplete crypto basis or missing market price.";
    return {
      content: `${firstAction} ${dataAction} For the money decision, the account does not store your emergency-fund target, time horizon, or risk limit, so I cannot defensibly turn ${cashMention} into a buy, sell, or allocation instruction. Treat it as an explicit decision gate: confirm the cash reserve and risk constraints first, then compare any proposed allocation against the portfolio's recorded exposure. Ask Portfolio is read-only and will not move or invest the money for you.`,
      toolName: "getDataQualityReport",
      sources: [
        receipt("Authenticated portfolio ledger quality scan", latestPrice, "CALCULATED", marketFreshness),
        ...(latestSnapshot ? [receipt("Monthly History cash reconciliation", latestSnapshot.asOfDate, "OBSERVED", "FRESH", `All-assets snapshot as of ${latestSnapshot.asOfDate}`)] : []),
      ],
      investmentRelated: true,
    };
  }

  if (questionIntent === "TOTAL_PORTFOLIO_VALUE" && (!goldIntent || /portfolio|portofolio|all assets|entire portfolio|seluruh aset|semua aset/.test(normalized))) {
    const latestSnapshot = context.portfolioRecap?.snapshots.at(-1);
    const latestSummary = context.portfolioRecap?.latestSummary;
    if (!latestSnapshot || !latestSummary) {
      return {
        content: "No all-assets Monthly History snapshot is available yet. I cannot calculate total portfolio value from the crypto ledger alone; add a Monthly History snapshot first.",
        toolName: "getPortfolioSummary",
        sources: [receipt("All-assets Monthly History data-quality check", now, "CALCULATED", "MISSING", "Monthly History snapshot required")],
        investmentRelated: true,
      };
    }
    const formatSnapshotIdr = (value: string) => {
      if (displayCurrency === "IDR") return formatNativeMoney(value, "IDR");
      if (latestSnapshot.idrPerUsd && new Decimal(latestSnapshot.idrPerUsd).gt(0)) {
        return formatNativeMoney(new Decimal(value).div(latestSnapshot.idrPerUsd).toString(), "USD");
      }
      return `${formatNativeMoney(value, "IDR")} (USD conversion unavailable)`;
    };
    const breakdown = [
      ["Bank", latestSnapshot.bankIdr],
      ["RDPU", latestSnapshot.rdpuIdr],
      ["IHSG", latestSnapshot.ihsgIdr],
      ["S&P 500", latestSnapshot.sp500Idr],
      ["BTC", latestSnapshot.btcIdr],
      ["ETH", latestSnapshot.ethIdr],
      ["Altcoin", latestSnapshot.altcoinIdr],
      ["Gold", latestSnapshot.goldIdr],
    ].map(([label, value]) => `${label} ${formatSnapshotIdr(value)}`).join(", ");
    return {
      content: `Your total portfolio value across all assets is ${formatSnapshotIdr(latestSummary.totalIdr)}, based on the latest Monthly History snapshot as of ${latestSnapshot.asOfDate}. Breakdown: ${breakdown}. This is the latest persisted all-assets snapshot, not a live intraday valuation.`,
      toolName: "getPortfolioSummary",
      sources: [receipt("Monthly History Net Worth snapshot", latestSnapshot.asOfDate, "OBSERVED", "FRESH", `All-assets snapshot as of ${latestSnapshot.asOfDate}`)],
      investmentRelated: true,
    };
  }

  if (goldIntent && questionIntent !== "GOAL_ALLOCATION") {
    const gold = context.portfolioRecap?.gold.summary;
    const goldTransactions = context.portfolioRecap?.gold.transactions
      .slice()
      .sort((left, right) => right.occurredOn.localeCompare(left.occurredOn));
    if (!gold) {
      return {
        content: "No gold records are available yet. Add a gold transaction or valuation in Portfolio Recap before asking about gold holdings.",
        toolName: "getPortfolioSummary",
        sources: [receipt("Gold data-quality check", now, "CALCULATED", "MISSING", "Gold ledger and valuation required")],
        investmentRelated: true,
      };
    }
    if (/transaction|ledger|history|transaksi|riwayat|beli|jual|buy|sell/.test(normalized)) {
      const recent = goldTransactions?.slice(0, 5) ?? [];
      return {
        content: recent.length
          ? `Your gold ledger has ${goldTransactions?.length ?? 0} transaction${goldTransactions?.length === 1 ? "" : "s"}. Latest entries: ${recent.map((item) => `${item.transactionType} ${item.grams} g at ${formatNativeMoney(item.unitPriceIdr, "IDR")} on ${item.occurredOn}`).join("; ")}.`
          : "No gold transactions are recorded yet.",
        toolName: "getTransactions",
        sources: [receipt("Authenticated gold ledger", now, "OBSERVED", "FRESH", "All matching persisted gold transactions")],
        investmentRelated: true,
      };
    }
    const valuation = gold.valuationPricePerGramIdr
      ? ` Latest valuation is ${formatNativeMoney(gold.valuationPricePerGramIdr, "IDR")} per gram as of ${gold.valuationDate ?? "the latest recorded date"}.`
      : " No gold valuation price is recorded yet, so market value is unavailable.";
    const marketValue = gold.marketValueIdr
      ? ` Estimated market value is ${formatNativeMoney(gold.marketValueIdr, "IDR")}.`
      : "";
    const pnl = gold.unrealizedPnlIdr
      ? ` Unrealized P&L is ${formatNativeMoney(gold.unrealizedPnlIdr, "IDR")}.`
      : "";
    return {
      content: `You currently hold ${gold.heldGrams} g of gold with ${formatNativeMoney(gold.remainingCostBasisIdr, "IDR")} of remaining recorded cost basis.${marketValue}${valuation}${pnl}`,
      toolName: "getPortfolioSummary",
      sources: [receipt("Gold ledger + valuation history", gold.valuationDate ?? now, "CALCULATED", gold.valuationPricePerGramIdr ? "FRESH" : "MISSING", "Latest persisted gold position")],
      investmentRelated: true,
    };
  }

  if (questionIntent === "GOAL_ALLOCATION") {
    const latestSnapshot = context.portfolioRecap?.snapshots.at(-1);
    const latestSummary = context.portfolioRecap?.latestSummary;
    if (!latestSnapshot || !latestSummary) {
      return {
        content: "I can outline a goal-based allocation framework, but there is no all-assets Monthly History snapshot available yet. The account also does not store each goal's target amount, deadline, or monthly contribution, so an exact allocation cannot be calculated safely. Record those inputs for the Hajj fund, children's education, and car goal first.",
        toolName: "getDataQualityReport",
        sources: [receipt("All-assets Monthly History data-quality check", now, "CALCULATED", "MISSING", "Monthly History snapshot required")],
        investmentRelated: true,
      };
    }

    const formatSnapshotIdr = (value: string) => {
      if (displayCurrency === "IDR") return formatNativeMoney(value, "IDR");
      if (latestSnapshot.idrPerUsd && new Decimal(latestSnapshot.idrPerUsd).gt(0)) {
        return formatNativeMoney(new Decimal(value).div(latestSnapshot.idrPerUsd).toString(), "USD");
      }
      return `${formatNativeMoney(value, "IDR")} (USD conversion unavailable)`;
    };
    const total = new Decimal(latestSummary.totalIdr);
    const percentOfTotal = (value: Decimal) => total.gt(0) ? value.div(total).mul(100).toFixed(1) : "0.0";
    const liquid = new Decimal(latestSnapshot.bankIdr).add(latestSnapshot.rdpuIdr);
    const stocks = new Decimal(latestSnapshot.ihsgIdr).add(latestSnapshot.sp500Idr);
    const crypto = new Decimal(latestSnapshot.btcIdr).add(latestSnapshot.ethIdr).add(latestSnapshot.altcoinIdr);
    const gold = new Decimal(latestSnapshot.goldIdr);
    const allocation = [
      `liquid ${formatSnapshotIdr(liquid.toString())} (${percentOfTotal(liquid)}%)`,
      `stocks ${formatSnapshotIdr(stocks.toString())} (${percentOfTotal(stocks)}%)`,
      `crypto ${formatSnapshotIdr(crypto.toString())} (${percentOfTotal(crypto)}%)`,
      `gold ${formatSnapshotIdr(gold.toString())} (${percentOfTotal(gold)}%)`,
    ].join(", ");
    return {
      content: `For a goal-based plan, separate money by deadline instead of using one allocation for every goal. Your latest all-assets Monthly History snapshot on ${latestSnapshot.asOfDate} totals ${formatSnapshotIdr(latestSummary.totalIdr)}: ${allocation}. 1. Daftar haji: if the deadline is within about three years, prioritize Bank/RDPU or other liquid, lower-volatility assets and do not depend on crypto for a fixed-date need. 2. Dana pendidikan anak: match the mix to the time horizon; a longer horizon can tolerate a diversified growth bucket, then shift gradually toward liquid or lower-volatility assets as the education date approaches. 3. Beli mobil: if the purchase is within one to three years, keep the target amount liquid or in lower-volatility assets and include tax, insurance, and maintenance in the target. The account does not yet store each goal's target amount, deadline, or monthly contribution, so I cannot calculate exact percentages or whether the current allocation is sufficient. This is a conditional research framework, not a buy or sell instruction.`,
      toolName: "getPortfolioSummary",
      sources: [receipt("Monthly History Net Worth snapshot", latestSnapshot.asOfDate, "OBSERVED", "FRESH", `All-assets snapshot as of ${latestSnapshot.asOfDate}`)],
      investmentRelated: true,
    };
  }

  if (/expense|spend|spending|spent|saving|savings|income|cash flow|budget|category|pengeluaran|belanja|pemasukan|pendapatan|tabungan|menabung|arus kas|anggaran|kategori/.test(normalized)) {
    const currentMonth = monthKey();
    const asksForPreviousMonth = /last month|previous month|prior month|bulan lalu|bulan sebelumnya/.test(normalized);
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

  if (/\b(?:smart|wallets?|late|tokens?|flows?|whales?|dompet|paus|ikan paus|arus dana)\b/.test(normalized) && !btcSignalIntent) {
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
      content: `The highest-priority observed event is ${event.tokenSymbol} on ${event.chain}, labeled ${event.entryStatus}. ${event.qualifiedWalletCount} qualified public-wallet proxies net-bought about ${formatMoney(event.netBuyUsd, displayCurrency, context.fxRates, true)}, while price moved ${formatPct(event.priceChangePct)} since first detection. Key risk: ${event.riskFactors[0] ?? "Wallet identity and intent are not independently verified."} This is a public-wallet proxy, not proof of institutional or insider activity.`,
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

  if (/quality|fix|missing|stale|trust|kualitas|perbaiki|perbaikan|kurang|hilang|usang|akurat|percaya|bisa dipercaya/.test(normalized)) {
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

  if (/transaction|ledger|trade history|bought|sold|when did i|last (?:buy|sell|trade)|latest (?:buy|sell|trade)|fees?\b|\b(?:buy|sell)\b|transaksi|riwayat|dibeli|terjual|beli|membeli|jual|menjual|setor|tarik|biaya/.test(normalized)) {
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
    const aggregateDirection = /\b(?:buy|bought|beli|membeli)\b/.test(normalized)
      ? "BUY"
      : /\b(?:sell|sold|jual|menjual)\b/.test(normalized)
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
    if (/\b(?:last|latest|most recent|terbaru|terakhir|paling baru)\b/.test(normalized)) {
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

  if (/\brealized\b|terealisasi|direalisasikan/.test(normalized) && !/\bunrealized\b|belum terealisasi/.test(normalized)) {
    return {
      content: `Your ledger-calculated realized P&L is ${formatMoney(portfolio.realizedPnlUsd)}. Current unrealized P&L is ${formatMoney(portfolio.unrealizedPnlUsd)} on ${formatMoney(portfolio.totalValueUsd)} of tracked value.${portfolio.incompleteBasis ? " Incomplete acquisition basis still makes parts of the portfolio record provisional." : ""}`,
      toolName: "getPortfolioSummary",
      sources: [receipt("Portfolio ledger realized P&L", latestPrice, "CALCULATED", marketFreshness)],
      investmentRelated: true,
    };
  }

  if (/cost basis|how much (?:have )?i invested|total invested|overall return|total return|\broi\b|basis biaya|total modal|berapa modal|imbal hasil keseluruhan|return total/.test(normalized) && !requestedHolding) {
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

  if (/daily|today|24h|one.day|hari ini|harian/.test(normalized) && /change|move|perform(?:ance|ed)?|pnl|p&l|gain|loss|perubah|kinerja|untung|rugi/.test(normalized)) {
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

  if (/highest|lowest|best|worst|winner|loser|performance|pnl|p&l|gain|profit|loss|performa|kinerja|untung|rugi|keuntungan|kerugian|imbal hasil|pengembalian/.test(normalized)) {
    const ordered = portfolio.holdings
      .slice()
      .sort((a, b) => new Decimal(b.unrealizedPnlUsd).cmp(a.unrealizedPnlUsd));
    const asksForWorst = /lowest|worst|loser|biggest loss|most loss|terendah|terburuk|rugi terbesar|kerugian terbesar/.test(normalized);
    const ranked = asksForWorst ? ordered.at(-1) : ordered[0];
    const asksForRanked = /highest|lowest|best|worst|winner|loser|biggest (?:gain|profit|loss)|most (?:gain|profit|loss)|tertinggi|terendah|terbaik|terburuk|terbesar/.test(normalized);
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
  const concentrationAnswer = /concentrat|allocation|diversif|risk|konsentras|alokasi|komposisi|porsi/.test(normalized);
  const summaryAnswer = /summar(?:y|ize)|overview|tell me about|what(?:'s| is) in .*portfolio|ringkasan|gambaran|jelaskan .*portofolio|isi .*portofolio/.test(normalized);
  if (!concentrationAnswer && !summaryAnswer) {
    return {
      content: "I could not map that question to a reliable calculation from the stored portfolio data yet. Try asking about total value, an asset's exposure or P&L, transaction history, spending, gold, BTC signals, or data quality.",
      toolName: "getPortfolioSummary",
      sources: [receipt("Authenticated portfolio question routing", latestPrice, "CALCULATED", marketFreshness)],
      investmentRelated: /portfolio|portofolio|asset|aset|invest|modal|uang|dana/.test(normalized),
    };
  }
  return {
    content: concentrationAnswer
      ? `BTC is ${concentration}% of tracked current value.${largest ? ` The largest position is ${largest.assetSymbol} at ${largest.allocationPct}%.` : ""} Whether that is too concentrated depends on your risk capacity and time horizon; the app can establish the exposure but not choose that limit for you.${portfolio.incompleteBasis ? " Incomplete acquisition basis makes the exact allocation or P&L provisional." : ""}`
      : `Your tracked portfolio is worth ${formatMoney(portfolio.totalValueUsd)}, with ${formatMoney(portfolio.unrealizedPnlUsd)} in unrealized P&L.${largest ? ` The largest position is ${largest.assetSymbol} at ${largest.allocationPct}% of current value.` : ""}${portfolio.incompleteBasis ? " Incomplete acquisition basis means P&L should be treated as provisional." : ""}`,
    toolName: "getPortfolioSummary",
    sources: [receipt("Portfolio ledger + market snapshot", latestPrice, "CALCULATED", marketFreshness)],
    investmentRelated: /portfolio|concentrat|allocation|risk|diversif|portofolio|konsentras|alokasi|komposisi|porsi/.test(normalized),
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
    /\b(drops?|falls?|declines?|decreases?|crashes?|down|rises?|gains?|increases?|up|turun|jatuh|anjlok|naik|meningkat)\b(?:\s+by|\s+sebanyak)?\s+(\d+(?:[.,]\d+)?)\s*%/i,
  );
  if (directional) {
    const magnitude = new Decimal(directional[2].replace(",", "."));
    const negative = /drop|fall|declin|decreas|crash|down|turun|jatuh|anjlok/i.test(directional[1]);
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
