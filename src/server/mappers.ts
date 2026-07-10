import type {
  Alert,
  AssistantMessage,
  Conversation,
  ImportBatch,
  PortfolioTransaction,
  SpendingTransaction,
  TokenFlowEvent,
  UserProfile,
  WatchlistWallet,
} from "@/lib/types";
import type {
  aiConversations,
  aiMessages,
  alerts,
  importBatches,
  portfolioTransactions,
  spendingTransactions,
  tokenFlowEvents,
  users,
  watchlistWallets,
} from "@/db/schema";

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];

export function mapProfile(row: Row<typeof users>): UserProfile {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    timezone: row.timezone,
    displayCurrency: row.displayCurrency,
    disclaimerAccepted: row.disclaimerAccepted,
    onboardingComplete: row.onboardingComplete,
  };
}

export function mapPortfolioTransaction(
  row: Row<typeof portfolioTransactions>,
): PortfolioTransaction {
  return {
    id: row.id,
    assetSymbol: row.assetSymbol,
    transactionType: row.transactionType,
    quantity: row.quantity,
    unitPriceUsd: row.unitPriceUsd,
    feeUsd: row.feeUsd,
    venue: row.venue,
    executedAt: row.executedAt.toISOString(),
    note: row.note ?? undefined,
    fingerprint: row.fingerprint ?? undefined,
  };
}

export function mapSpendingTransaction(
  row: Row<typeof spendingTransactions>,
): SpendingTransaction {
  return {
    id: row.id,
    occurredOn: row.occurredOn,
    amount: row.amount,
    currency: row.currency,
    direction: row.direction,
    category: row.category,
    account: row.account,
    note: row.note ?? undefined,
    fingerprint: row.fingerprint ?? undefined,
  };
}

export function mapWallet(row: Row<typeof watchlistWallets>): WatchlistWallet {
  return {
    id: row.id,
    chain: row.chain,
    address: row.address,
    label: row.label,
    classification: row.classification,
    qualityScore: row.qualityScore,
    winRatePct: row.winRatePct ?? undefined,
    closedPositions: row.closedPositions ?? undefined,
    enabled: row.enabled,
    lastCheckedAt: row.lastCheckedAt?.toISOString(),
  };
}

export function mapEvent(
  row: Row<typeof tokenFlowEvents>,
  walletIds: string[],
): TokenFlowEvent {
  return {
    id: row.id,
    chain: row.chain,
    tokenSymbol: row.tokenSymbol,
    tokenName: row.tokenName,
    contractAddress: row.tokenAddress,
    dexPair: row.dexPair,
    entryStatus: row.entryStatus,
    smartMoneyScore: row.smartMoneyScore,
    qualifiedWalletCount: row.qualifiedWalletCount,
    netBuyUsd: row.netBuyUsd,
    priceChangePct: row.priceChangeSinceFirstBuy,
    liquidityUsd: row.liquidityUsd,
    volume24hUsd: row.volume24hUsd,
    firstDetectedAt: row.firstDetectedAt.toISOString(),
    evaluatedAt: row.evaluatedAt.toISOString(),
    riskFactors: row.riskFactors,
    walletIds,
    sourceLinks: row.sourceLinks,
  };
}

export function mapAlert(row: Row<typeof alerts>): Alert {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    severity: row.severity,
    eventId: row.tokenFlowEventId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString(),
  };
}

export function mapConversation(row: Row<typeof aiConversations>): Conversation {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapMessage(row: Row<typeof aiMessages>): AssistantMessage {
  const sourceSummary = row.sourceSummary as AssistantMessage["sources"] | null;
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    sources: sourceSummary ?? undefined,
    investmentRelated: row.investmentRelated,
  };
}

export function mapImportBatch(row: Row<typeof importBatches>): ImportBatch {
  return {
    id: row.id,
    source: row.source,
    fileName: row.fileName,
    acceptedRows: row.acceptedRows,
    duplicateRows: row.duplicateRows,
    invalidRows: row.invalidRows,
    createdAt: row.createdAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString(),
  };
}
