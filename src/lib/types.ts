export type DecimalString = string;
export type DisplayCurrency = "USD" | "IDR";
export type SupportedCurrency = DisplayCurrency | "EUR";
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
  currency: SupportedCurrency;
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
  currency: SupportedCurrency;
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
export type StrategyLifecycle =
  | "CANDIDATE"
  | "SHADOW"
  | "VALIDATED"
  | "DEGRADED"
  | "REJECTED"
  | "RETIRED"
  | "PAUSED";
export type SignalMode = "RESEARCH" | "SHADOW" | "VALIDATED";
export type SignalAvailability = "READY" | "HALTED";

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
  sourceLinks?: Array<{ label: string; url: string }>;
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
  mode: SignalMode;
  availability: SignalAvailability;
  agreementPct: DecimalString;
  targetAllocationPct: DecimalString;
  deltaAllocationPct: DecimalString;
  recommendedUsd: DecimalString;
  recommendedBtc: DecimalString;
  hardExit: boolean;
  inputHash?: string;
  evidence: SignalEvidence[];
}

export interface BtcStrategyProfile {
  lifecycleStatus: StrategyLifecycle;
  ruleVersion: string;
  ruleHash: string;
  sleeveBudgetUsd?: DecimalString;
  cashBalanceUsd: DecimalString;
  btcQuantity: DecimalString;
  modelAllocationPct: DecimalString;
  confirmedAllocationPct: DecimalString;
  shadowStartedAt?: string;
  shadowDays: number;
  shadowSignals: number;
  lastModelChangeAt?: string;
  recoveringFromHardExit: boolean;
  latestValidation?: StrategyValidationSummary;
}

export interface StrategyValidationSummary {
  id: string;
  status: "RUNNING" | "PASSED" | "FAILED";
  datasetStartedOn?: string;
  datasetEndedOn?: string;
  ruleHash: string;
  metrics: Record<string, unknown>;
  failureReasons: string[];
  startedAt: string;
  completedAt?: string;
}

export interface SignalAcknowledgement {
  id: string;
  signalId: string;
  status: "EXECUTED" | "SKIPPED" | "EXPIRED";
  actualPriceUsd?: DecimalString;
  actualQuantityBtc?: DecimalString;
  actualFeeUsd?: DecimalString;
  executedAt?: string;
  createdAt: string;
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

export type WalletChain = "Bitcoin" | "Ethereum" | "Solana" | "Base" | "Arbitrum";

export interface WatchlistWallet {
  id: string;
  chain: WalletChain;
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

export type AssistantGenerationMode =
  | "VERCEL_AI_GATEWAY"
  | "OPENAI"
  | "DETERMINISTIC";

export type AssistantFallbackReason =
  | "NOT_CONFIGURED"
  | "PROVIDER_AUTHENTICATION"
  | "PROVIDER_BILLING"
  | "PROVIDER_RATE_LIMIT"
  | "PROVIDER_ERROR"
  | "EMPTY_RESPONSE"
  | "UNSAFE_RESPONSE";

export interface AssistantMessage {
  id: string;
  conversationId: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
  toolName?: AssistantToolName;
  sources?: SourceReceipt[];
  investmentRelated?: boolean;
  generationMode?: AssistantGenerationMode;
  generationFallbackReason?: AssistantFallbackReason;
  model?: string;
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
