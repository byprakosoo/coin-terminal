import type {
  Alert,
  AssistantMessage,
  BtcSignal,
  Conversation,
  FxRate,
  ImportBatch,
  MarketPoint,
  MarketPrice,
  PortfolioTransaction,
  SpendingTransaction,
  TokenFlowEvent,
  UserProfile,
  WatchlistWallet,
} from "@/lib/types";

const isoAgo = (now: number, amount: number, unit: "minutes" | "hours" | "days") => {
  const multiplier = unit === "minutes" ? 60_000 : unit === "hours" ? 3_600_000 : 86_400_000;
  return new Date(now - amount * multiplier).toISOString();
};

const dateAgo = (now: number, days: number) => isoAgo(now, days, "days").slice(0, 10);

function spendingDate(now: number, monthOffset: number, day: number) {
  const date = new Date(now);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset, day))
    .toISOString()
    .slice(0, 10);
}

export interface DemoData {
  profile: UserProfile;
  prices: MarketPrice[];
  fxRates: FxRate[];
  transactions: PortfolioTransaction[];
  spending: SpendingTransaction[];
  signals: BtcSignal[];
  marketHistory: MarketPoint[];
  wallets: WatchlistWallet[];
  events: TokenFlowEvent[];
  alerts: Alert[];
  conversations: Conversation[];
  messages: AssistantMessage[];
  importBatches: ImportBatch[];
}

export function createDemoData(now = Date.now()): DemoData {
  const evaluatedAt = isoAgo(now, 2, "hours");
  const expiresAt = isoAgo(now + 24 * 3_600_000, 2, "hours");
  const profile: UserProfile = {
    id: "user-demo",
    name: "Alex Morgan",
    email: "alex@example.com",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    displayCurrency: "IDR",
    disclaimerAccepted: false,
    onboardingComplete: false,
  };

  const prices: MarketPrice[] = [
    {
      assetSymbol: "BTC",
      name: "Bitcoin",
      priceUsd: "104860.42",
      dailyChangePct: "2.84",
      observedAt: isoAgo(now, 7, "minutes"),
      freshness: "FRESH",
    },
    {
      assetSymbol: "ETH",
      name: "Ethereum",
      priceUsd: "3642.18",
      dailyChangePct: "1.26",
      observedAt: isoAgo(now, 7, "minutes"),
      freshness: "FRESH",
    },
    {
      assetSymbol: "SOL",
      name: "Solana",
      priceUsd: "182.74",
      dailyChangePct: "-0.92",
      observedAt: isoAgo(now, 7, "minutes"),
      freshness: "FRESH",
    },
  ];

  const transactions: PortfolioTransaction[] = [
    {
      id: "tx-btc-1",
      assetSymbol: "BTC",
      transactionType: "BUY",
      quantity: "0.12",
      unitPriceUsd: "61200",
      feeUsd: "14.5",
      venue: "Coinbase",
      executedAt: isoAgo(now, 330, "days"),
      note: "Initial position",
    },
    {
      id: "tx-eth-1",
      assetSymbol: "ETH",
      transactionType: "BUY",
      quantity: "2.4",
      unitPriceUsd: "2480",
      feeUsd: "9.8",
      venue: "Kraken",
      executedAt: isoAgo(now, 260, "days"),
    },
    {
      id: "tx-sol-1",
      assetSymbol: "SOL",
      transactionType: "BUY",
      quantity: "31",
      unitPriceUsd: "128",
      feeUsd: "6.2",
      venue: "Coinbase",
      executedAt: isoAgo(now, 190, "days"),
    },
    {
      id: "tx-btc-2",
      assetSymbol: "BTC",
      transactionType: "BUY",
      quantity: "0.055",
      unitPriceUsd: "87400",
      feeUsd: "11.25",
      venue: "Kraken",
      executedAt: isoAgo(now, 96, "days"),
    },
    {
      id: "tx-eth-reward",
      assetSymbol: "ETH",
      transactionType: "REWARD",
      quantity: "0.08",
      unitPriceUsd: "0",
      feeUsd: "0",
      venue: "Staking",
      executedAt: isoAgo(now, 38, "days"),
      note: "Basis documentation missing",
    },
    {
      id: "tx-sol-sell",
      assetSymbol: "SOL",
      transactionType: "SELL",
      quantity: "6",
      unitPriceUsd: "194.2",
      feeUsd: "3.4",
      venue: "Coinbase",
      executedAt: isoAgo(now, 14, "days"),
    },
  ];

  const recurring = [
    ["Housing", "1850"],
    ["Groceries", "430.18"],
    ["Transport", "176.42"],
    ["Dining", "218.9"],
    ["Subscriptions", "84.35"],
  ] as const;
  const spending: SpendingTransaction[] = [];
  for (let offset = -5; offset <= 0; offset += 1) {
    spending.push({
      id: `sp-salary-${offset}`,
      occurredOn: spendingDate(now, offset, 1),
      amount: offset === 0 ? "7200" : String(6800 + (offset + 5) * 80),
      currency: "USD",
      direction: "INCOME",
      category: "Salary",
      account: "Checking",
      note: "Monthly salary",
    });
    recurring.forEach(([category, amount], index) =>
      spending.push({
        id: `sp-${category}-${offset}`,
        occurredOn: spendingDate(now, offset, offset === 0 ? 2 + index * 2 : 3 + index * 4),
        amount: String(Number(amount) + Math.max(0, -offset) * (index + 2) * 3.2),
        currency: "USD",
        direction: "EXPENSE",
        category,
        account: index > 1 ? "Credit card" : "Checking",
        note: category === "Housing" ? "Rent" : undefined,
      }),
    );
  }

  const currentEvidence = [
    {
      id: "e-momentum",
      group: "Price momentum",
      rule: "7D / 30D return",
      weightPct: "30",
      score: "68",
      value: "+4.8% / +11.2%",
      interpretation: "Momentum remains constructive, but below directional threshold.",
      source: "CoinGecko BTC daily history",
      sourceUrl: "https://www.coingecko.com/en/coins/bitcoin",
      observedAt: isoAgo(now, 2, "hours"),
      kind: "OBSERVED" as const,
    },
    {
      id: "e-trend",
      group: "Trend",
      rule: "20D / 50D moving averages",
      weightPct: "25",
      score: "74",
      value: "$101.4K / $94.8K",
      interpretation: "Price and short trend remain above the medium-term trend.",
      source: "Calculated from daily closes",
      sourceUrl: "https://www.coingecko.com/en/coins/bitcoin/historical_data",
      observedAt: isoAgo(now, 2, "hours"),
      kind: "CALCULATED" as const,
    },
    {
      id: "e-rsi",
      group: "Mean reversion",
      rule: "14-day RSI",
      weightPct: "20",
      score: "41",
      value: "68.7",
      interpretation: "RSI is warm; upside entry quality is deteriorating.",
      source: "Calculated from daily closes",
      sourceUrl: "https://www.coingecko.com/en/coins/bitcoin/historical_data",
      observedAt: isoAgo(now, 2, "hours"),
      kind: "CALCULATED" as const,
    },
    {
      id: "e-volatility",
      group: "Volatility risk",
      rule: "30D realized volatility",
      weightPct: "15",
      score: "36",
      value: "54.2% annualized",
      interpretation: "Elevated volatility lowers conviction and position quality.",
      source: "Calculated from daily closes",
      sourceUrl: "https://www.coingecko.com/en/coins/bitcoin/historical_data",
      observedAt: isoAgo(now, 2, "hours"),
      kind: "CALCULATED" as const,
    },
    {
      id: "e-wallets",
      group: "Public-wallet context",
      rule: "Observed qualified flows",
      weightPct: "10",
      score: "55",
      value: "+$3.2M net inflow",
      interpretation: "Public-wallet context is mildly supportive, not decisive.",
      source: "mempool.space public address observations",
      sourceUrl: "https://mempool.space/",
      observedAt: isoAgo(now, 5, "hours"),
      kind: "INFERRED" as const,
    },
  ];

  const signals: BtcSignal[] = [
    {
      id: "signal-current",
      action: "WATCH",
      compositeScore: "59.2",
      confidencePct: "72",
      evaluatedAt,
      expiresAt,
      freshness: "FRESH",
      ruleVersion: "btc-daily-v1.3.0",
      summary:
        "Trend remains constructive, but warm RSI and elevated realized volatility keep the setup below the BUY threshold.",
      priceUsd: "104860.42",
      change24hPct: "2.84",
      mode: "RESEARCH",
      availability: "READY",
      agreementPct: "60",
      targetAllocationPct: "0",
      deltaAllocationPct: "0",
      recommendedUsd: "0",
      recommendedBtc: "0",
      hardExit: false,
      evidence: currentEvidence,
    },
    {
      id: "signal-1",
      action: "BUY",
      compositeScore: "73.8",
      confidencePct: "78",
      evaluatedAt: isoAgo(now, 9, "days"),
      expiresAt: isoAgo(now, 8, "days"),
      freshness: "FRESH",
      ruleVersion: "btc-daily-v1.3.0",
      summary: "Broad trend agreement with contained volatility.",
      priceUsd: "96240",
      change24hPct: "1.2",
      mode: "RESEARCH",
      availability: "READY",
      agreementPct: "80",
      targetAllocationPct: "10",
      deltaAllocationPct: "10",
      recommendedUsd: "0",
      recommendedBtc: "0",
      hardExit: false,
      evidence: currentEvidence,
    },
    {
      id: "signal-2",
      action: "WATCH",
      compositeScore: "55.4",
      confidencePct: "64",
      evaluatedAt: isoAgo(now, 18, "days"),
      expiresAt: isoAgo(now, 17, "days"),
      freshness: "FRESH",
      ruleVersion: "btc-daily-v1.2.1",
      summary: "Mixed momentum and mean-reversion inputs.",
      priceUsd: "94810",
      change24hPct: "-0.4",
      mode: "RESEARCH",
      availability: "READY",
      agreementPct: "60",
      targetAllocationPct: "10",
      deltaAllocationPct: "0",
      recommendedUsd: "0",
      recommendedBtc: "0",
      hardExit: false,
      evidence: currentEvidence,
    },
    {
      id: "signal-3",
      action: "SELL",
      compositeScore: "28.9",
      confidencePct: "70",
      evaluatedAt: isoAgo(now, 32, "days"),
      expiresAt: isoAgo(now, 31, "days"),
      freshness: "FRESH",
      ruleVersion: "btc-daily-v1.2.1",
      summary: "Momentum and trend weakened while volatility expanded.",
      priceUsd: "88760",
      change24hPct: "-3.8",
      mode: "RESEARCH",
      availability: "READY",
      agreementPct: "20",
      targetAllocationPct: "0",
      deltaAllocationPct: "-10",
      recommendedUsd: "0",
      recommendedBtc: "0",
      hardExit: false,
      evidence: currentEvidence,
    },
  ];

  const marketHistory: MarketPoint[] = Array.from({ length: 60 }, (_, index) => {
    const daysAgo = 59 - index;
    const trend = 84_000 + index * 340;
    const wave = Math.sin(index / 4.2) * 3_700 + Math.cos(index / 8) * 1_900;
    const close = trend + wave;
    return {
      date: dateAgo(now, daysAgo),
      close: close.toFixed(2),
      ma20: (trend - 1_450 + Math.sin(index / 7) * 850).toFixed(2),
      ma50: (trend - 5_200 + Math.cos(index / 10) * 650).toFixed(2),
    };
  });

  const wallets: WatchlistWallet[] = [
    {
      id: "wallet-1",
      chain: "Ethereum",
      address: "0x8ba1f109551bD432803012645Ac136ddd64DBA72",
      label: "Northstar Fund Proxy",
      classification: "HIGH_PERFORMANCE_PROXY",
      qualityScore: "84",
      winRatePct: "63",
      closedPositions: 37,
      enabled: true,
      lastCheckedAt: isoAgo(now, 12, "minutes"),
    },
    {
      id: "wallet-2",
      chain: "Base",
      address: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      label: "Public Research Wallet",
      classification: "PUBLICLY_ATTRIBUTED",
      qualityScore: "76",
      winRatePct: "58",
      closedPositions: 24,
      enabled: true,
      lastCheckedAt: isoAgo(now, 18, "minutes"),
    },
    {
      id: "wallet-3",
      chain: "Bitcoin",
      address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
      label: "Long Horizon BTC",
      classification: "USER_VERIFIED",
      qualityScore: "72",
      enabled: true,
      lastCheckedAt: isoAgo(now, 41, "minutes"),
    },
    {
      id: "wallet-4",
      chain: "Arbitrum",
      address: "0x66f820a414680B5bcda5eECA5dea238543F42054",
      label: "Unverified whale 04",
      classification: "UNVERIFIED_WHALE",
      qualityScore: "42",
      enabled: false,
      lastCheckedAt: isoAgo(now, 2, "days"),
    },
  ];

  const events: TokenFlowEvent[] = [
    {
      id: "event-ena",
      chain: "Ethereum",
      tokenSymbol: "ENA",
      tokenName: "Ethena",
      contractAddress: "0x57e114B691Db790C35207b2e685D4A43181e6061",
      dexPair: "ENA / USDC",
      entryStatus: "EXTENDED",
      smartMoneyScore: "81",
      qualifiedWalletCount: 3,
      netBuyUsd: "1240000",
      priceChangePct: "41.8",
      liquidityUsd: "18200000",
      volume24hUsd: "9600000",
      firstDetectedAt: isoAgo(now, 19, "hours"),
      evaluatedAt: isoAgo(now, 11, "minutes"),
      riskFactors: ["Price is 41.8% above first detection", "RSI is elevated at 74", "Buy volume slowed in the last 4h"],
      walletIds: ["wallet-1", "wallet-2", "wallet-3"],
      sourceLinks: [
        { label: "DEX Screener pair", url: "https://dexscreener.com/ethereum/0x57e114b691db790c35207b2e685d4a43181e6061" },
        { label: "Etherscan token", url: "https://etherscan.io/token/0x57e114B691Db790C35207b2e685D4A43181e6061" },
      ],
    },
    {
      id: "event-aero",
      chain: "Base",
      tokenSymbol: "AERO",
      tokenName: "Aerodrome Finance",
      contractAddress: "0x940181a94A35A4569E4529A3CDfB74e38FD98631",
      dexPair: "AERO / USDC",
      entryStatus: "CONFIRMED",
      smartMoneyScore: "74",
      qualifiedWalletCount: 2,
      netBuyUsd: "486000",
      priceChangePct: "22.6",
      liquidityUsd: "34800000",
      volume24hUsd: "12100000",
      firstDetectedAt: isoAgo(now, 8, "hours"),
      evaluatedAt: isoAgo(now, 18, "minutes"),
      riskFactors: ["Price has moved into confirmation range"],
      walletIds: ["wallet-1", "wallet-2"],
      sourceLinks: [{ label: "DEX Screener pair", url: "https://dexscreener.com/base/0x940181a94a35a4569e4529a3cdfb74e38fd98631" }],
    },
    {
      id: "event-ondo",
      chain: "Ethereum",
      tokenSymbol: "ONDO",
      tokenName: "Ondo",
      contractAddress: "0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3",
      dexPair: "ONDO / USDC",
      entryStatus: "EARLY",
      smartMoneyScore: "68",
      qualifiedWalletCount: 2,
      netBuyUsd: "318000",
      priceChangePct: "9.4",
      liquidityUsd: "27600000",
      volume24hUsd: "7400000",
      firstDetectedAt: isoAgo(now, 4, "hours"),
      evaluatedAt: isoAgo(now, 23, "minutes"),
      riskFactors: ["Observed flow is a public-wallet proxy"],
      walletIds: ["wallet-1", "wallet-2"],
      sourceLinks: [{ label: "Etherscan token", url: "https://etherscan.io/token/0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3" }],
    },
    {
      id: "event-risk",
      chain: "Arbitrum",
      tokenSymbol: "MOONX",
      tokenName: "Moon X",
      contractAddress: "0x000000000000000000000000000000000000dEaD",
      dexPair: "MOONX / WETH",
      entryStatus: "AVOID",
      smartMoneyScore: "31",
      qualifiedWalletCount: 1,
      netBuyUsd: "92000",
      priceChangePct: "67.1",
      liquidityUsd: "118000",
      volume24hUsd: "870000",
      firstDetectedAt: isoAgo(now, 31, "hours"),
      evaluatedAt: isoAgo(now, 1, "hours"),
      riskFactors: ["Low liquidity", "New pair", "Single-wallet concentration", "Sharp reversal detected"],
      walletIds: ["wallet-4"],
      sourceLinks: [{ label: "DEX Screener search", url: "https://dexscreener.com/" }],
    },
  ];

  const alerts: Alert[] = [
    {
      id: "alert-extended",
      title: "ENA entry is already extended",
      description: "Price moved 41.8% since first qualified-wallet detection.",
      severity: "HIGH_RISK",
      eventId: "event-ena",
      createdAt: isoAgo(now, 11, "minutes"),
    },
    {
      id: "alert-early",
      title: "Early ONDO flow cluster",
      description: "Two qualified wallets accumulated within four hours.",
      severity: "INFO",
      eventId: "event-ondo",
      createdAt: isoAgo(now, 23, "minutes"),
    },
    {
      id: "alert-basis",
      title: "Cost basis needs attention",
      description: "One ETH reward has no acquisition value.",
      severity: "WARNING",
      createdAt: isoAgo(now, 6, "hours"),
      readAt: isoAgo(now, 5, "hours"),
    },
  ];

  const conversations: Conversation[] = [
    {
      id: "conversation-1",
      title: "Portfolio concentration",
      createdAt: isoAgo(now, 2, "days"),
      updatedAt: isoAgo(now, 2, "days"),
    },
  ];

  const messages: AssistantMessage[] = [
    {
      id: "message-1",
      conversationId: "conversation-1",
      role: "USER",
      content: "Am I too concentrated in BTC?",
      createdAt: isoAgo(now, 2, "days"),
    },
    {
      id: "message-2",
      conversationId: "conversation-1",
      role: "ASSISTANT",
      content:
        "BTC is your largest position and represents roughly half of the tracked portfolio. That is a meaningful single-asset concentration. Review your risk tolerance and the incomplete ETH reward basis before relying on the exact percentage.",
      createdAt: isoAgo(now, 2, "days"),
      toolName: "getPortfolioSummary",
      sources: [
        {
          label: "Portfolio ledger + market snapshot",
          period: "Current holdings",
          freshness: "FRESH",
          observedAt: isoAgo(now, 7, "minutes"),
          kind: "CALCULATED",
        },
      ],
      investmentRelated: true,
    },
  ];

  return {
    profile,
    prices,
    fxRates: [
      { currency: "USD", usdRate: "1", observedAt: isoAgo(now, 8, "hours"), freshness: "FRESH" },
      { currency: "IDR", usdRate: "16275", observedAt: isoAgo(now, 8, "hours"), freshness: "FRESH" },
      { currency: "EUR", usdRate: "0.92", observedAt: isoAgo(now, 8, "hours"), freshness: "FRESH" },
    ],
    transactions,
    spending,
    signals,
    marketHistory,
    wallets,
    events,
    alerts,
    conversations,
    messages,
    importBatches: [],
  };
}
