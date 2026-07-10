export type DecimalString = string;
export type DisplayCurrency = "USD" | "IDR" | "EUR";
export type Freshness = "FRESH" | "DELAYED" | "STALE" | "MISSING";
export type EvidenceKind =
  | "OBSERVED"
  | "CALCULATED"
  | "INFERRED"
  | "UNVERIFIED"
  | "STALE";

export type TransactionType =
  | "BUY"
  | "SELL"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "REWARD"
  | "AIRDROP"
  | "FEE";

export interface DemoSession {
  userId: string;
  signedInAt: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  timezone: string;
  displayCurrency: DisplayCurrency;
  disclaimerAccepted: boolean;
  onboardingComplete: boolean;
}

export interface MarketPrice {
  assetSymbol: string;
  name: string;
  priceUsd: DecimalString;
  dailyChangePct: DecimalString;
  observedAt: string;
  freshness: Freshness;
}

export interface FxRate {
  currency: DisplayCurrency;
  usdRate: DecimalString;
  observedAt: string;
  freshness: Freshness;
}

export interface PortfolioTransaction {
  id: string;
  assetSymbol: string;
  transactionType: TransactionType;
  quantity: DecimalString;
  unitPriceUsd: DecimalString;
  feeUsd: DecimalString;
  venue: string;
  executedAt: string;
  note?: string;
  fingerprint?: string;
}

export interface Holding {
  assetSymbol: string;
  name: string;
  quantity: DecimalString;
  averageCostUsd: DecimalString;
  currentPriceUsd: DecimalString;
  currentValueUsd: DecimalString;
  costBasisUsd: DecimalString;
  realizedPnlUsd: DecimalString;
  unrealizedPnlUsd: DecimalString;
  allocationPct: DecimalString;
  dailyChangePct: DecimalString;
  incompleteBasis: boolean;
}

export interface PortfolioSummary {
  totalValueUsd: DecimalString;
  totalCostBasisUsd: DecimalString;
  realizedPnlUsd: DecimalString;
  unrealizedPnlUsd: DecimalString;
  dailyChangePct: DecimalString;
  incompleteBasis: boolean;
  holdings: Holding[];
}

export type SpendingDirection = "INCOME" | "EXPENSE";

export interface SpendingTransaction {
  id: string;
  occurredOn: string;
  amount: DecimalString;
  currency: DisplayCurrency;
  direction: SpendingDirection;
  category: string;
  account: string;
  note?: string;
  fingerprint?: string;
}

export interface SpendingSummary {
  month: string;
  incomeUsd: DecimalString;
  expensesUsd: DecimalString;
  savingsUsd: DecimalString;
  savingsRatePct: DecimalString;
  previousIncomeUsd: DecimalString;
  previousExpensesUsd: DecimalString;
  expenseChangePct: DecimalString;
  byCategory: Array<{ category: string; amountUsd: DecimalString }>;
}

export type SignalAction = "BUY" | "SELL" | "WATCH";

export interface SignalEvidence {
  id: string;
  group: string;
  rule: string;
  weightPct: DecimalString;
  score: DecimalString;
  value: string;
  interpretation: string;
  source: string;
  sourceUrl: string;
  observedAt: string;
  kind: EvidenceKind;
}

export interface BtcSignal {
  id: string;
  action: SignalAction;
  compositeScore: DecimalString;
  confidencePct: DecimalString;
  evaluatedAt: string;
  expiresAt: string;
  freshness: Freshness;
  ruleVersion: string;
  summary: string;
  priceUsd: DecimalString;
  change24hPct: DecimalString;
  evidence: SignalEvidence[];
}

export interface MarketPoint {
  date: string;
  close: DecimalString;
  ma20: DecimalString;
  ma50: DecimalString;
}

export type WalletClassification =
  | "USER_VERIFIED"
  | "PUBLICLY_ATTRIBUTED"
  | "HIGH_PERFORMANCE_PROXY"
  | "UNVERIFIED_WHALE"
  | "EXCLUDED";

export interface WatchlistWallet {
  id: string;
  chain: "Bitcoin" | "Ethereum" | "Base" | "Arbitrum";
  address: string;
  label: string;
  classification: WalletClassification;
  qualityScore: DecimalString;
  winRatePct?: DecimalString;
  closedPositions?: number;
  enabled: boolean;
  lastCheckedAt?: string;
}

export type EntryStatus = "EARLY" | "CONFIRMED" | "EXTENDED" | "AVOID";

export interface TokenFlowEvent {
  id: string;
  chain: string;
  tokenSymbol: string;
  tokenName: string;
  contractAddress: string;
  dexPair: string;
  entryStatus: EntryStatus;
  smartMoneyScore: DecimalString;
  qualifiedWalletCount: number;
  netBuyUsd: DecimalString;
  priceChangePct: DecimalString;
  liquidityUsd: DecimalString;
  volume24hUsd: DecimalString;
  firstDetectedAt: string;
  evaluatedAt: string;
  riskFactors: string[];
  walletIds: string[];
  sourceLinks: Array<{ label: string; url: string }>;
}

export interface Alert {
  id: string;
  title: string;
  description: string;
  severity: "INFO" | "WARNING" | "HIGH_RISK";
  eventId?: string;
  createdAt: string;
  readAt?: string;
}

export type AssistantToolName =
  | "getPortfolioSummary"
  | "getAssetPerformance"
  | "getTransactions"
  | "getSpendingSummary"
  | "getBtcSignalExplanation"
  | "getSmartMoneyEvents"
  | "getDataQualityReport";

export interface SourceReceipt {
  label: string;
  period: string;
  freshness: Freshness;
  observedAt: string;
  kind: EvidenceKind;
}

export interface AssistantMessage {
  id: string;
  conversationId: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
  toolName?: AssistantToolName;
  sources?: SourceReceipt[];
  investmentRelated?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export type ImportRowStatus = "ACCEPTED" | "DUPLICATE" | "INVALID";

export interface ImportPreviewRow {
  rowNumber: number;
  values: Record<string, string>;
  normalized?: Record<string, string>;
  status: ImportRowStatus;
  issues: string[];
  fingerprint?: string;
}

export interface ImportBatch {
  id: string;
  source: "MONEY_LOVER" | "PORTFOLIO_CSV";
  fileName: string;
  acceptedRows: number;
  duplicateRows: number;
  invalidRows: number;
  createdAt: string;
  confirmedAt?: string;
}
