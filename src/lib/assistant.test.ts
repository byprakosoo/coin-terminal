import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildAssistantReply } from "@/lib/assistant";
import { defensiveRuleVersion } from "@/lib/btc-defensive-strategy";
import { btcResearchRuleVersion } from "@/lib/btc-research-rule";
import { createDemoData } from "@/lib/seed";
import type { BtcSignal } from "@/lib/types";

const seed = createDemoData(new Date("2026-07-10T12:00:00.000Z").getTime());
const context = {
  transactions: seed.transactions,
  spending: seed.spending,
  prices: seed.prices,
  signals: [
    {
      ...seed.signals[0],
      ruleVersion: defensiveRuleVersion,
      mode: "SHADOW" as const,
    },
  ],
  events: seed.events,
};

function currentResearchSignal({
  walletValue = "+0.8 BTC net",
  institutionalValue = "4,790 long / 2,405 short contracts",
}: {
  walletValue?: string;
  institutionalValue?: string;
} = {}): BtcSignal {
  const [momentum, trend, meanReversion, volatility, wallet] = seed.signals[0].evidence;
  return {
    ...seed.signals[0],
    ruleVersion: btcResearchRuleVersion,
    mode: "RESEARCH",
    evidence: [
      { ...momentum, weightPct: "25" },
      trend,
      meanReversion,
      volatility,
      {
        id: "e-cftc-institutional",
        group: "CFTC institutional positioning",
        rule: "CME BTC asset-manager net position and weekly change",
        weightPct: "10",
        score: "69.94",
        value: institutionalValue,
        interpretation: "Delayed futures positioning may include hedges.",
        source: "CFTC Traders in Financial Futures — CME Bitcoin futures only",
        sourceUrl: "https://publicreporting.cftc.gov/Commitments-of-Traders/TFF-Futures-Only/gpe5-46if",
        observedAt: momentum.observedAt,
        kind: "CALCULATED",
      },
      { ...wallet, weightPct: "5", value: walletValue },
    ],
  };
}

describe("buildAssistantReply", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T12:00:00.000Z"));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("routes BTC questions to the signal explanation tool", () => {
    const reply = buildAssistantReply("Why is BTC currently WATCH?", context);
    expect(reply.toolName).toBe("getBtcSignalExplanation");
    expect(reply.content).toContain("BTC is currently WATCH");
    expect(reply.sources.length).toBeGreaterThan(0);
    expect(reply.investmentRelated).toBe(true);
  });

  it("routes expense questions to the spending selector", () => {
    const reply = buildAssistantReply("How did my expenses change?", context);
    expect(reply.toolName).toBe("getSpendingSummary");
    expect(reply.content).toContain("expenses");
    expect(reply.investmentRelated).toBe(false);
  });

  it("routes goal allocation questions to a useful portfolio fallback", () => {
    const question = "Berdasarkan tabungan dan alokasi portofolio gue saat ini, gimana cara pengalokasian yang baik berdasarkan tujuan keuangan gue.\n\n1. Daftar haji\n2. Dana pendidikan anak\n3. Beli mobil";
    const reply = buildAssistantReply(question, {
      ...context,
      displayCurrency: "IDR",
      portfolioRecap: {
        snapshots: [{
          id: "snapshot-1",
          asOfDate: "2026-07-31",
          sequence: 1,
          source: "MANUAL",
          bankIdr: "700000",
          rdpuIdr: "100000",
          ihsgIdr: "50000",
          sp500Idr: "0",
          btcIdr: "100000",
          ethIdr: "50000",
          altcoinIdr: "0",
          goldIdr: "0",
          idrPerUsd: "16000",
          createdAt: "2026-07-31T00:00:00.000Z",
          updatedAt: "2026-07-31T00:00:00.000Z",
        }],
        latestSummary: { totalIdr: "1000000" },
      },
    } as never);

    expect(reply.toolName).toBe("getPortfolioSummary");
    expect(reply.content).toContain("Daftar haji");
    expect(reply.content).toContain("Dana pendidikan anak");
    expect(reply.content).toContain("Beli mobil");
    expect(reply.content).not.toContain("This month you recorded");
    expect(reply.investmentRelated).toBe(true);
  });

  it("surfaces incomplete basis in data-quality answers", () => {
    const reply = buildAssistantReply("What data should I fix before trusting P&L?", context);
    expect(reply.toolName).toBe("getDataQualityReport");
    expect(reply.content).toContain("affects ETH");
  });

  it("does not misroute smart-money buys as a BTC signal question", () => {
    const reply = buildAssistantReply("What are the latest smart-money buys?", context);
    expect(reply.toolName).toBe("getSmartMoneyEvents");
    expect(reply.content).toContain("public-wallet proxy");
  });

  it("returns authenticated ledger entries for transaction questions", () => {
    const reply = buildAssistantReply("When did I buy BTC?", context);
    expect(reply.toolName).toBe("getTransactions");
    expect(reply.content).toContain("BUY");
    expect(reply.content).toContain("BTC");
  });

  it("preserves stale market state in portfolio source receipts", () => {
    const reply = buildAssistantReply("Summarize my tracked portfolio", {
      ...context,
      prices: context.prices.map((price) => ({ ...price, freshness: "STALE" as const })),
    });
    expect(reply.sources[0].freshness).toBe("STALE");
  });

  it("prefers current consensus research over an unvalidated defensive shadow signal", () => {
    const researchSignal = {
      ...currentResearchSignal({ walletValue: "+1.2 BTC net" }),
      compositeScore: "72.50",
      agreementPct: "99.98",
    };
    const reply = buildAssistantReply("What is the current Bitcoin signal?", {
      ...context,
      signals: [researchSignal, ...context.signals],
    });

    expect(reply.content).toContain(btcResearchRuleVersion);
    expect(reply.content).toContain("research verdict");
    expect(reply.content).toContain("CFTC institutional context");
    expect(reply.content).toContain("Wallet context: +1.2 BTC net");
    expect(reply.content).toContain("not a validated win probability");
  });

  it("answers BTC ownership questions from the portfolio instead of the signal route", () => {
    const reply = buildAssistantReply("How much BTC do I own and what is its allocation?", context);

    expect(reply.toolName).toBe("getAssetPerformance");
    expect(reply.content).toContain("0.175 units");
    expect(reply.content).toContain("Average cost");
    expect(reply.content).not.toContain("research evaluation");
  });

  it("calculates an asset price-shock scenario from the tracked portfolio", () => {
    const reply = buildAssistantReply("If BTC drops by 20%, what happens to my portfolio?", context);

    expect(reply.toolName).toBe("getAssetPerformance");
    expect(reply.content).toContain("-20%");
    expect(reply.content).toContain("every other holding unchanged");
    expect(reply.content).toContain("Tracked portfolio value becomes");
  });

  it("reports portfolio-level realized P&L separately from unrealized P&L", () => {
    const reply = buildAssistantReply("What is my realized P&L?", context);

    expect(reply.toolName).toBe("getPortfolioSummary");
    expect(reply.content).toContain("realized P&L");
    expect(reply.content).toContain("unrealized P&L");
  });

  it("answers current-month spending questions for a named category", () => {
    const reply = buildAssistantReply("How much did I spend on groceries?", context);

    expect(reply.toolName).toBe("getSpendingSummary");
    expect(reply.content).toContain("Groceries spending");
    expect(reply.content).toContain("total recorded expenses");
  });

  it("combines requested asset exposure with a data-quality limitation", () => {
    const reply = buildAssistantReply(
      "Compare my BTC exposure with the rest and explain the biggest data-quality limitation.",
      context,
    );

    expect(reply.toolName).toBe("getDataQualityReport");
    expect(reply.content).toContain("BTC is");
    expect(reply.content).toContain("all other holdings total");
    expect(reply.content).toContain("Incomplete acquisition basis affects ETH");
  });

  it("routes BTC wallet-context questions to the BTC research explanation", () => {
    const researchSignal = currentResearchSignal();
    const reply = buildAssistantReply(
      "How did wallet movements affect the BTC signal?",
      { ...context, signals: [researchSignal, ...context.signals] },
    );

    expect(reply.toolName).toBe("getBtcSignalExplanation");
    expect(reply.content).toContain("Wallet context: +0.8 BTC net");
  });

  it("combines BTC exposure with the current signal when both are requested", () => {
    const researchSignal = currentResearchSignal();
    const reply = buildAssistantReply(
      "Compare my BTC exposure with the current signal",
      { ...context, signals: [researchSignal, ...context.signals] },
    );

    expect(reply.toolName).toBe("getBtcSignalExplanation");
    expect(reply.content).toContain("Your tracked BTC position is 0.175 units");
    expect(reply.content).toContain("BTC research is currently");
    expect(reply.sources[0].label).toContain("BTC ledger");
  });

  it("totals recorded portfolio and asset fees", () => {
    const allFees = buildAssistantReply("What are my total transaction fees?", context);
    const btcFees = buildAssistantReply("How much did I pay in BTC fees?", context);

    expect(allFees.toolName).toBe("getTransactions");
    expect(allFees.content).toContain("$45.15");
    expect(btcFees.content).toContain("$25.75");
  });

  it("aggregates executed buy quantities and notionals", () => {
    const reply = buildAssistantReply("How much BTC did I buy in total?", context);

    expect(reply.toolName).toBe("getTransactions");
    expect(reply.content).toContain("2 BUY transactions");
    expect(reply.content).toContain("0.175 BTC");
    expect(reply.content).toContain("$12,151.00");
  });

  it("returns the latest matching trade with its fee and venue", () => {
    const reply = buildAssistantReply("What was my latest trade?", context);

    expect(reply.toolName).toBe("getTransactions");
    expect(reply.content).toContain("SELL 6 SOL");
    expect(reply.content).toContain("Coinbase");
  });

  it("answers total cost-basis and return questions with quality caveats", () => {
    const reply = buildAssistantReply("What is my total cost basis and overall return?", context);

    expect(reply.toolName).toBe("getPortfolioSummary");
    expect(reply.content).toContain("recorded cost basis");
    expect(reply.content).toContain("Realized P&L");
    expect(reply.content).toContain("provisional");
  });

  it("calculates portfolio and asset daily snapshot moves", () => {
    const portfolioReply = buildAssistantReply("How much did my portfolio move today?", context);
    const btcReply = buildAssistantReply("How did BTC perform today?", context);

    expect(portfolioReply.toolName).toBe("getPortfolioSummary");
    expect(portfolioReply.content).toContain("weighted one-day move");
    expect(btcReply.toolName).toBe("getAssetPerformance");
    expect(btcReply.content).toContain("BTC's latest provider daily move is +2.84%");
  });

  it("distinguishes the worst performer from a general P&L summary", () => {
    const worst = buildAssistantReply("Which holding is my worst performer?", context);
    const summary = buildAssistantReply("Summarize my P&L", context);

    expect(worst.content).toContain("SOL has the lowest tracked unrealized P&L");
    expect(summary.content).toContain("across 3 open holdings");
    expect(summary.content).toContain("BTC");
    expect(summary.content).toContain("ETH");
    expect(summary.content).toContain("SOL");
  });

  it("answers previous-month category spending and refuses to invent a budget", () => {
    const groceries = buildAssistantReply("How much did I spend on groceries last month?", context);
    const budget = buildAssistantReply("Am I over my spending budget?", context);

    expect(groceries.content).toContain("Groceries spending last month");
    expect(groceries.content).toContain("$439.78");
    expect(budget.content).toContain("No explicit spending budget is stored");
  });
});
