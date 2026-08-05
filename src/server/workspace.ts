import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { db } from "@/db";
import {
  aiConversations,
  aiMessages,
  aiToolCalls,
  alerts,
  dataSources,
  importBatches,
  marketSnapshots,
  portfolioTransactions,
  signalEvidence,
  signalRuleVersions,
  signals,
  spendingCarryovers,
  spendingTransactions,
  tokenFlowEvents,
  tokenFlowEventWallets,
  users,
  watchlistWallets,
} from "@/db/schema";
import { createDemoData } from "@/lib/seed";
import { trackedWhaleWallets } from "@/lib/tracked-wallets";
import { providerIds, ruleVersionId } from "@/server/constants";
import { syncMarketData } from "@/server/jobs/market-sync";
import type {
  AssistantMessage,
  BtcSignal,
  DemoSession,
  Freshness,
  FxRate,
  MarketPoint,
  MarketPrice,
} from "@/lib/types";
import {
  mapAlert,
  mapConversation,
  mapEvent,
  mapImportBatch,
  mapMessage,
  mapPortfolioTransaction,
  mapProfile,
  mapSpendingCarryover,
  mapSpendingTransaction,
  mapWallet,
} from "@/server/mappers";
import { fingerprint, payloadHash, stableId } from "@/server/ids";

export async function ensureWorkspace(userId: string) {
  const [user] = await db
    .select({
      workspaceSeededAt: users.workspaceSeededAt,
      smartMoneyWalletsSeededAt: users.smartMoneyWalletsSeededAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw new Error("Authenticated user record was not found.");
  await removeLegacyDemoRecords(userId);
  if (!user.smartMoneyWalletsSeededAt) await seedTrackedWhaleWallets(userId);
  if (user.workspaceSeededAt) return;

  await db.transaction(async (tx) => {
    await tx
      .insert(dataSources)
      .values([
        { id: providerIds.coingecko, provider: "CoinGecko", sourceUrl: "https://api.coingecko.com/api/v3", enabled: true },
        { id: providerIds.dexScreener, provider: "DEX Screener", sourceUrl: "https://api.dexscreener.com", enabled: true },
        { id: providerIds.mempool, provider: "mempool.space", sourceUrl: "https://mempool.space/api", enabled: true },
        { id: providerIds.etherscan, provider: "Etherscan", sourceUrl: "https://api.etherscan.io/v2/api", enabled: false },
      ])
      .onDuplicateKeyUpdate({ set: { id: sql`${dataSources.id}` } });
    await tx
      .insert(signalRuleVersions)
      .values({
        id: ruleVersionId,
        version: "btc-daily-v1.3.0",
        active: false,
        lifecycleStatus: "RETIRED",
        configuration: {
          thresholds: { buy: 70, sell: 30 },
          staleAfterHours: 24,
          weights: { momentum: 30, trend: 25, meanReversion: 20, volatility: 15, wallets: 10 },
        },
      })
      .onDuplicateKeyUpdate({ set: { id: sql`${signalRuleVersions.id}` } });
    await tx
      .update(users)
      .set({ workspaceSeededAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.workspaceSeededAt)));
  });
}

async function seedTrackedWhaleWallets(userId: string) {
  await db.transaction(async (tx) => {
    await tx
      .insert(watchlistWallets)
      .values(
        trackedWhaleWallets.map((wallet) => ({
          id: stableId(userId, `tracked-wallet:${wallet.key}`),
          userId,
          chain: wallet.chain,
          address: wallet.address,
          label: wallet.label,
          classification: wallet.classification,
          qualityScore: wallet.qualityScore,
          enabled: wallet.enabled,
        })),
      )
      .onDuplicateKeyUpdate({ set: { id: sql`${watchlistWallets.id}` } });
    await tx
      .update(users)
      .set({ smartMoneyWalletsSeededAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.smartMoneyWalletsSeededAt)));
  });
}

// Retained only as an explicit development fixture generator. Production
// workspace initialization never calls this function.
export async function seedDemoWorkspace(userId: string) {
  const [user] = await db
    .select({ workspaceSeededAt: users.workspaceSeededAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw new Error("Authenticated user record was not found.");
  if (user.workspaceSeededAt) return;

  const demo = createDemoData();
  const tickerSnapshotIds = new Map<string, string>();

  await db.transaction(async (tx) => {
    await tx
      .insert(dataSources)
      .values([
        {
          id: providerIds.coingecko,
          provider: "CoinGecko",
          sourceUrl: "https://api.coingecko.com/api/v3",
          enabled: true,
        },
        {
          id: providerIds.dexScreener,
          provider: "DEX Screener",
          sourceUrl: "https://api.dexscreener.com",
          enabled: true,
        },
        {
          id: providerIds.mempool,
          provider: "mempool.space",
          sourceUrl: "https://mempool.space/api",
          enabled: true,
        },
        {
          id: providerIds.etherscan,
          provider: "Etherscan",
          sourceUrl: "https://api.etherscan.io/v2/api",
          enabled: false,
        },
        {
          id: providerIds.demoFx,
          provider: "Demo FX snapshot",
          sourceUrl: "internal://seeded-fx",
          enabled: true,
        },
      ])
      .onDuplicateKeyUpdate({ set: { id: sql`${dataSources.id}` } });

    const tickerSnapshots = demo.prices.map((price) => {
      const payload = {
        assetSymbol: price.assetSymbol,
        name: price.name,
        priceUsd: price.priceUsd,
        dailyChangePct: price.dailyChangePct,
      };
      const snapshotId = stableId("market-ticker", `${price.assetSymbol}:${payloadHash(payload)}`);
      tickerSnapshotIds.set(price.assetSymbol, snapshotId);
      return {
        id: snapshotId,
        dataSourceId: providerIds.coingecko,
        instrument: `${price.assetSymbol}/USD`,
        snapshotType: "TICKER" as const,
        observedAt: new Date(price.observedAt),
        fetchedAt: new Date(price.observedAt),
        freshnessStatus: price.freshness,
        payload,
        payloadHash: payloadHash(payload),
      };
    });

    const fxSnapshots = demo.fxRates.map((rate) => {
      const payload = { currency: rate.currency, usdRate: rate.usdRate };
      return {
        id: stableId("market-fx", `${rate.currency}:${payloadHash(payload)}`),
        dataSourceId: providerIds.demoFx,
        instrument: `USD/${rate.currency}`,
        snapshotType: "FX" as const,
        observedAt: new Date(rate.observedAt),
        fetchedAt: new Date(rate.observedAt),
        freshnessStatus: rate.freshness,
        payload,
        payloadHash: payloadHash(payload),
      };
    });

    const candleSnapshots = demo.marketHistory.map((point) => {
      const payload = { ...point };
      const observedAt = new Date(`${point.date}T23:59:59.000Z`);
      return {
        id: stableId("market-candle", point.date),
        dataSourceId: providerIds.coingecko,
        instrument: "BTC/USD",
        snapshotType: "DAILY_CANDLE" as const,
        observedAt,
        fetchedAt: observedAt,
        freshnessStatus: "FRESH" as const,
        payload,
        payloadHash: payloadHash(payload),
      };
    });

    await tx
      .insert(marketSnapshots)
      .values([...tickerSnapshots, ...fxSnapshots, ...candleSnapshots])
      .onDuplicateKeyUpdate({ set: { id: sql`${marketSnapshots.id}` } });

    await tx
      .insert(signalRuleVersions)
      .values({
        id: ruleVersionId,
        version: "btc-daily-v1.3.0",
        active: false,
        lifecycleStatus: "RETIRED",
        configuration: {
          thresholds: { buy: 70, sell: 30 },
          staleAfterHours: 24,
          weights: { momentum: 30, trend: 25, meanReversion: 20, volatility: 15, wallets: 10 },
        },
      })
      .onDuplicateKeyUpdate({ set: { id: sql`${signalRuleVersions.id}` } });

    const transactionRows = demo.transactions.map((item) => ({
      id: stableId(userId, item.id),
      userId,
      assetSymbol: item.assetSymbol,
      transactionType: item.transactionType,
      quantity: item.quantity,
      unitPriceUsd: item.unitPriceUsd,
      totalValueUsd: new Decimal(item.quantity).mul(item.unitPriceUsd).toString(),
      feeUsd: item.feeUsd,
      venue: item.venue,
      note: item.note,
      executedAt: new Date(item.executedAt),
      fingerprint: fingerprint(userId, [
        item.assetSymbol,
        item.transactionType,
        item.quantity,
        item.unitPriceUsd,
        item.executedAt,
        item.feeUsd,
      ]),
    }));
    await tx
      .insert(portfolioTransactions)
      .values(transactionRows)
      .onDuplicateKeyUpdate({ set: { id: sql`${portfolioTransactions.id}` } });

    const spendingRows = demo.spending.map((item) => ({
      id: stableId(userId, item.id),
      userId,
      occurredOn: item.occurredOn,
      reportMonth: item.reportMonth ?? item.occurredOn.slice(0, 7),
      amount: item.amount,
      currency: item.currency,
      direction: item.direction,
      category: item.category,
      account: item.account,
      note: item.note,
      fingerprint: fingerprint(userId, [
        item.occurredOn,
        item.amount,
        item.direction,
        item.category,
        item.account,
        item.note,
      ]),
    }));
    await tx
      .insert(spendingTransactions)
      .values(spendingRows)
      .onDuplicateKeyUpdate({ set: { id: sql`${spendingTransactions.id}` } });

    const signalIds = new Map<string, string>();
    const signalRows = demo.signals.map((signal) => {
      const signalId = stableId(userId, signal.id);
      signalIds.set(signal.id, signalId);
      return {
        id: signalId,
        userId,
        ruleVersionId,
        instrument: "BTC/USD",
        action: signal.action,
        compositeScore: signal.compositeScore,
        confidence: signal.confidencePct,
        freshnessStatus: signal.freshness,
        summary: signal.summary,
        priceUsd: signal.priceUsd,
        change24hPct: signal.change24hPct,
        evaluatedAt: new Date(signal.evaluatedAt),
        expiresAt: new Date(signal.expiresAt),
      };
    });
    await tx
      .insert(signals)
      .values(signalRows)
      .onDuplicateKeyUpdate({ set: { id: sql`${signals.id}` } });

    const evidenceRows = demo.signals.flatMap((signal) =>
      signal.evidence.map((evidence, index) => ({
        id: stableId(userId, `${signal.id}:${evidence.id}:${index}`),
        signalId: signalIds.get(signal.id)!,
        marketSnapshotId: tickerSnapshotIds.get("BTC"),
        groupName: evidence.group,
        ruleName: evidence.rule,
        weightPct: evidence.weightPct,
        score: evidence.score,
        value: evidence.value,
        interpretation: evidence.interpretation,
        sourceLabel: evidence.source,
        sourceUrl: evidence.sourceUrl,
        observedAt: new Date(evidence.observedAt),
        evidenceKind: evidence.kind,
        details: { seed: true },
      })),
    );
    await tx
      .insert(signalEvidence)
      .values(evidenceRows)
      .onDuplicateKeyUpdate({ set: { id: sql`${signalEvidence.id}` } });

    const walletIds = new Map<string, string>();
    const walletRows = demo.wallets.map((wallet) => {
      const walletId = stableId(userId, wallet.id);
      walletIds.set(wallet.id, walletId);
      return {
        id: walletId,
        userId,
        chain: wallet.chain,
        address: wallet.address,
        label: wallet.label,
        classification: wallet.classification,
        qualityScore: wallet.qualityScore,
        winRatePct: wallet.winRatePct,
        closedPositions: wallet.closedPositions,
        enabled: wallet.enabled,
        lastCheckedAt: wallet.lastCheckedAt ? new Date(wallet.lastCheckedAt) : undefined,
      };
    });
    await tx
      .insert(watchlistWallets)
      .values(walletRows)
      .onDuplicateKeyUpdate({ set: { id: sql`${watchlistWallets.id}` } });

    const eventIds = new Map<string, string>();
    const eventRows = demo.events.map((event) => {
      const eventId = stableId(userId, event.id);
      eventIds.set(event.id, eventId);
      return {
        id: eventId,
        userId,
        chain: event.chain,
        tokenAddress: event.contractAddress,
        tokenSymbol: event.tokenSymbol,
        tokenName: event.tokenName,
        dexPair: event.dexPair,
        entryStatus: event.entryStatus,
        smartMoneyScore: event.smartMoneyScore,
        qualifiedWalletCount: event.qualifiedWalletCount,
        netBuyUsd: event.netBuyUsd,
        priceChangeSinceFirstBuy: event.priceChangePct,
        liquidityUsd: event.liquidityUsd,
        volume24hUsd: event.volume24hUsd,
        firstDetectedAt: new Date(event.firstDetectedAt),
        evaluatedAt: new Date(event.evaluatedAt),
        riskFactors: event.riskFactors,
        sourceLinks: event.sourceLinks,
        evidence: { source: "seeded public-wallet proxy", observed: true },
      };
    });
    await tx
      .insert(tokenFlowEvents)
      .values(eventRows)
      .onDuplicateKeyUpdate({ set: { id: sql`${tokenFlowEvents.id}` } });

    const eventWalletRows = demo.events.flatMap((event) =>
      event.walletIds.flatMap((walletId) => {
        const mappedWalletId = walletIds.get(walletId);
        return mappedWalletId
          ? [{ tokenFlowEventId: eventIds.get(event.id)!, watchlistWalletId: mappedWalletId }]
          : [];
      }),
    );
    await tx
      .insert(tokenFlowEventWallets)
      .values(eventWalletRows)
      .onDuplicateKeyUpdate({
        set: { watchlistWalletId: sql`${tokenFlowEventWallets.watchlistWalletId}` },
      });

    const alertRows = demo.alerts.map((alert) => ({
      id: stableId(userId, alert.id),
      userId,
      tokenFlowEventId: alert.eventId ? eventIds.get(alert.eventId) : undefined,
      alertType: alert.severity === "HIGH_RISK" ? "LATE_ENTRY_RISK" : "RESEARCH",
      severity: alert.severity,
      title: alert.title,
      description: alert.description,
      status: alert.readAt ? ("READ" as const) : ("UNREAD" as const),
      cooldownKey: alert.eventId ? `${alert.eventId}:${alert.severity}` : undefined,
      createdAt: new Date(alert.createdAt),
      readAt: alert.readAt ? new Date(alert.readAt) : undefined,
    }));
    await tx
      .insert(alerts)
      .values(alertRows)
      .onDuplicateKeyUpdate({ set: { id: sql`${alerts.id}` } });

    const conversationIds = new Map<string, string>();
    const conversationRows = demo.conversations.map((conversation) => {
      const conversationId = stableId(userId, conversation.id);
      conversationIds.set(conversation.id, conversationId);
      return {
        id: conversationId,
        userId,
        title: conversation.title,
        createdAt: new Date(conversation.createdAt),
        updatedAt: new Date(conversation.updatedAt),
      };
    });
    await tx
      .insert(aiConversations)
      .values(conversationRows)
      .onDuplicateKeyUpdate({ set: { id: sql`${aiConversations.id}` } });

    const messageIds = new Map<string, string>();
    const messageRows = demo.messages.map((message) => {
      const messageId = stableId(userId, message.id);
      messageIds.set(message.id, messageId);
      return {
        id: messageId,
        conversationId: conversationIds.get(message.conversationId)!,
        role: message.role,
        content: message.content,
        sourceSummary: message.sources?.map((source) => ({ ...source })),
        investmentRelated: message.investmentRelated ?? false,
        createdAt: new Date(message.createdAt),
      };
    });
    await tx
      .insert(aiMessages)
      .values(messageRows)
      .onDuplicateKeyUpdate({ set: { id: sql`${aiMessages.id}` } });

    const assistantSeed = demo.messages.find((message) => message.toolName);
    if (assistantSeed?.toolName) {
      await tx
        .insert(aiToolCalls)
        .values({
          id: stableId(userId, `${assistantSeed.id}:tool`),
          aiMessageId: messageIds.get(assistantSeed.id)!,
          toolName: assistantSeed.toolName,
          status: "SUCCEEDED",
          requestSummary: { source: "seed" },
          resultSummary: { receipts: assistantSeed.sources?.length ?? 0 },
          createdAt: new Date(assistantSeed.createdAt),
        })
        .onDuplicateKeyUpdate({ set: { id: sql`${aiToolCalls.id}` } });
    }

    await tx
      .update(users)
      .set({ workspaceSeededAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.workspaceSeededAt)));
  });
}

export async function loadWorkspace(userId: string, signedInAt = new Date()) {
  await ensureWorkspace(userId);

  const [
    profileRows,
    transactionRows,
    spendingRows,
    carryoverRows,
    walletRows,
    eventRows,
    eventWalletRows,
    alertRows,
    conversationRows,
    messageRows,
    toolCallRows,
    batchRows,
    signalRows,
    evidenceRows,
    ruleRows,
    snapshotRows,
  ] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db
      .select()
      .from(portfolioTransactions)
      .where(eq(portfolioTransactions.userId, userId))
      .orderBy(desc(portfolioTransactions.executedAt)),
    db
      .select()
      .from(spendingTransactions)
      .where(eq(spendingTransactions.userId, userId))
      .orderBy(desc(spendingTransactions.occurredOn)),
    db
      .select()
      .from(spendingCarryovers)
      .where(eq(spendingCarryovers.userId, userId))
      .orderBy(desc(spendingCarryovers.reportMonth)),
    db
      .select()
      .from(watchlistWallets)
      .where(eq(watchlistWallets.userId, userId))
      .orderBy(desc(watchlistWallets.createdAt)),
    db
      .select()
      .from(tokenFlowEvents)
      .where(eq(tokenFlowEvents.userId, userId))
      .orderBy(desc(tokenFlowEvents.evaluatedAt)),
    db
      .select()
      .from(tokenFlowEventWallets)
      .innerJoin(tokenFlowEvents, eq(tokenFlowEvents.id, tokenFlowEventWallets.tokenFlowEventId))
      .where(eq(tokenFlowEvents.userId, userId)),
    db.select().from(alerts).where(eq(alerts.userId, userId)).orderBy(desc(alerts.createdAt)),
    db
      .select()
      .from(aiConversations)
      .where(and(eq(aiConversations.userId, userId), isNull(aiConversations.deletedAt)))
      .orderBy(desc(aiConversations.updatedAt)),
    db
      .select({ message: aiMessages })
      .from(aiMessages)
      .innerJoin(aiConversations, eq(aiConversations.id, aiMessages.conversationId))
      .where(and(eq(aiConversations.userId, userId), isNull(aiConversations.deletedAt)))
      .orderBy(asc(aiMessages.createdAt)),
    db
      .select({ call: aiToolCalls })
      .from(aiToolCalls)
      .innerJoin(aiMessages, eq(aiMessages.id, aiToolCalls.aiMessageId))
      .innerJoin(aiConversations, eq(aiConversations.id, aiMessages.conversationId))
      .where(and(eq(aiConversations.userId, userId), isNull(aiConversations.deletedAt))),
    db
      .select()
      .from(importBatches)
      .where(eq(importBatches.userId, userId))
      .orderBy(desc(importBatches.createdAt)),
    db.select().from(signals).where(eq(signals.userId, userId)).orderBy(desc(signals.evaluatedAt)),
    db
      .select({ evidence: signalEvidence })
      .from(signalEvidence)
      .innerJoin(signals, eq(signals.id, signalEvidence.signalId))
      .where(eq(signals.userId, userId)),
    db.select().from(signalRuleVersions),
    db.select().from(marketSnapshots).orderBy(desc(marketSnapshots.observedAt)).limit(500),
  ]);

  const profile = profileRows[0];
  if (!profile) throw new Error("Authenticated user record was not found.");

  const walletIdsByEvent = new Map<string, string[]>();
  for (const row of eventWalletRows) {
    const list = walletIdsByEvent.get(row.token_flow_event_wallets.tokenFlowEventId) ?? [];
    list.push(row.token_flow_event_wallets.watchlistWalletId);
    walletIdsByEvent.set(row.token_flow_event_wallets.tokenFlowEventId, list);
  }

  const toolCallByMessage = new Map(toolCallRows.map(({ call }) => [call.aiMessageId, call]));
  const messages = messageRows.map(({ message }) => {
    const call = toolCallByMessage.get(message.id);
    const generationMode = call?.resultSummary?.generationMode;
    const generationFallbackReason = call?.resultSummary?.fallbackReason;
    const model = call?.resultSummary?.model;
    return {
      ...mapMessage(message),
      toolName: call?.toolName as AssistantMessage["toolName"],
      generationMode:
        generationMode === "VERCEL_AI_GATEWAY" ||
        generationMode === "OPENAI" ||
        generationMode === "DETERMINISTIC"
          ? generationMode
          : undefined,
      generationFallbackReason:
        generationFallbackReason === "NOT_CONFIGURED" ||
        generationFallbackReason === "PROVIDER_AUTHENTICATION" ||
        generationFallbackReason === "PROVIDER_BILLING" ||
        generationFallbackReason === "PROVIDER_RATE_LIMIT" ||
        generationFallbackReason === "PROVIDER_ERROR" ||
        generationFallbackReason === "EMPTY_RESPONSE" ||
        generationFallbackReason === "UNSAFE_RESPONSE"
          ? generationFallbackReason
          : undefined,
      model: typeof model === "string" ? model : undefined,
    };
  });

  const rules = new Map(ruleRows.map((rule) => [rule.id, rule.version]));
  const evidenceBySignal = new Map<string, typeof evidenceRows>();
  evidenceRows.forEach((row) => {
    const list = evidenceBySignal.get(row.evidence.signalId) ?? [];
    list.push(row);
    evidenceBySignal.set(row.evidence.signalId, list);
  });

  const btcSignals: BtcSignal[] = signalRows.map((signal) => ({
    id: signal.id,
    action: signal.action,
    compositeScore: signal.compositeScore,
    confidencePct: signal.confidence,
    evaluatedAt: signal.evaluatedAt.toISOString(),
    expiresAt: signal.expiresAt.toISOString(),
    freshness: dynamicFreshness(signal.freshnessStatus, signal.evaluatedAt, 24 * 60 * 60 * 1000),
    ruleVersion: rules.get(signal.ruleVersionId) ?? "unknown",
    summary: signal.summary,
    priceUsd: signal.priceUsd,
    change24hPct: signal.change24hPct,
    mode: signal.mode,
    availability: signal.availability,
    agreementPct: signal.agreementPct,
    targetAllocationPct: signal.targetAllocationPct,
    deltaAllocationPct: signal.deltaAllocationPct,
    recommendedUsd: signal.recommendedUsd,
    recommendedBtc: signal.recommendedBtc,
    hardExit: signal.hardExit,
    inputHash: signal.inputHash ?? undefined,
    evidence: (evidenceBySignal.get(signal.id) ?? []).map(({ evidence }) => ({
      id: evidence.id,
      group: evidence.groupName,
      rule: evidence.ruleName,
      weightPct: evidence.weightPct,
      score: evidence.score,
      value: evidence.value,
      interpretation: evidence.interpretation,
      source: evidence.sourceLabel,
      sourceUrl: evidence.sourceUrl,
      sourceLinks: evidenceSourceLinks(evidence.details),
      observedAt: evidence.observedAt.toISOString(),
      kind: evidence.evidenceKind,
    })),
  }));

  return {
    session: {
      userId,
      signedInAt: signedInAt.toISOString(),
    } satisfies DemoSession,
    profile: mapProfile(profile),
    prices: latestPrices(snapshotRows),
    fxRates: latestFxRates(snapshotRows),
    transactions: transactionRows.map(mapPortfolioTransaction),
    spending: [...spendingRows.map(mapSpendingTransaction), ...carryoverRows.map(mapSpendingCarryover)],
    signals: btcSignals,
    marketHistory: marketHistory(snapshotRows),
    wallets: walletRows.map(mapWallet),
    events: eventRows.map((event) => mapEvent(event, walletIdsByEvent.get(event.id) ?? [])),
    alerts: alertRows.map(mapAlert),
    conversations: conversationRows.map(mapConversation),
    messages,
    importBatches: batchRows.map(mapImportBatch),
  };
}

/** Refresh live market data outside the bootstrap request's critical path. */
export async function refreshMarketData() {
  try {
    await syncMarketData();
  } catch (error) {
    console.error("Market data refresh failed; keeping the persisted market snapshot.", error);
  }
}

async function removeLegacyDemoRecords(userId: string) {
  const demo = createDemoData();
  const ids = (items: Array<{ id: string }>) => items.map((item) => stableId(userId, item.id));

  await db.transaction(async (tx) => {
    const alertIds = ids(demo.alerts);
    const eventIds = ids(demo.events);
    const walletIds = ids(demo.wallets);
    const signalIds = ids(demo.signals);
    const conversationIds = ids(demo.conversations);
    const transactionIds = ids(demo.transactions);
    const spendingIds = ids(demo.spending);

    if (alertIds.length) await tx.delete(alerts).where(inArray(alerts.id, alertIds));
    if (eventIds.length) await tx.delete(tokenFlowEvents).where(inArray(tokenFlowEvents.id, eventIds));
    if (walletIds.length) await tx.delete(watchlistWallets).where(inArray(watchlistWallets.id, walletIds));
    if (signalIds.length) await tx.delete(signals).where(inArray(signals.id, signalIds));
    if (conversationIds.length) await tx.delete(aiConversations).where(inArray(aiConversations.id, conversationIds));
    if (transactionIds.length) await tx.delete(portfolioTransactions).where(inArray(portfolioTransactions.id, transactionIds));
    if (spendingIds.length) await tx.delete(spendingTransactions).where(inArray(spendingTransactions.id, spendingIds));
  });
}

type Snapshot = typeof marketSnapshots.$inferSelect;

function latestPrices(rows: Snapshot[]): MarketPrice[] {
  const result = new Map<string, MarketPrice>();
  for (const row of rows) {
    if (row.snapshotType !== "TICKER") continue;
    // Legacy demo snapshots used the same timestamp for observation and fetch.
    // Live provider snapshots always retain their actual fetch timestamp.
    if (row.fetchedAt.getTime() === row.observedAt.getTime()) continue;
    const payload = row.payload as Partial<MarketPrice>;
    if (!payload.assetSymbol || !payload.name || !payload.priceUsd || result.has(payload.assetSymbol)) {
      continue;
    }
    result.set(payload.assetSymbol, {
      assetSymbol: payload.assetSymbol,
      name: payload.name,
      priceUsd: payload.priceUsd,
      dailyChangePct: payload.dailyChangePct ?? "0",
      observedAt: row.observedAt.toISOString(),
      freshness: dynamicFreshness(row.freshnessStatus, row.observedAt, 15 * 60 * 1000),
    });
  }
  return [...result.values()];
}

function latestFxRates(rows: Snapshot[]): FxRate[] {
  const result = new Map<string, FxRate>();
  for (const row of rows) {
    if (row.snapshotType !== "FX") continue;
    const payload = row.payload as Partial<FxRate>;
    if (!payload.currency || !payload.usdRate || result.has(payload.currency)) continue;
    result.set(payload.currency, {
      currency: payload.currency,
      usdRate: payload.usdRate,
      observedAt: row.observedAt.toISOString(),
      freshness: dynamicFreshness(row.freshnessStatus, row.observedAt, 24 * 60 * 60 * 1000),
    });
  }
  return [...result.values()];
}

function marketHistory(rows: Snapshot[]): MarketPoint[] {
  const byDate = new Map<string, { point: MarketPoint; fetchedAt: Date }>();
  for (const row of rows) {
    if (row.snapshotType !== "DAILY_CANDLE" || row.instrument !== "BTC/USD") continue;
    // Historical demo candles used their observation timestamp as fetchedAt.
    // Provider-backed candles retain the real job fetch timestamp.
    if (row.fetchedAt.getTime() === row.observedAt.getTime()) continue;
    const point = row.payload as unknown as MarketPoint;
    if (!point.date || !point.close || !point.ma20 || !point.ma50) continue;
    const current = byDate.get(point.date);
    if (!current || row.fetchedAt > current.fetchedAt) {
      byDate.set(point.date, { point, fetchedAt: row.fetchedAt });
    }
  }
  return [...byDate.values()]
    .map(({ point }) => point)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function dynamicFreshness(
  stored: Freshness,
  observedAt: Date,
  freshForMs: number,
): Freshness {
  if (stored === "MISSING" || stored === "STALE") return stored;
  const age = Date.now() - observedAt.getTime();
  if (age > 24 * 60 * 60 * 1000) return "STALE";
  if (age > freshForMs) return "DELAYED";
  return stored;
}

function evidenceSourceLinks(details: Record<string, unknown> | null) {
  if (!details || !Array.isArray(details.sourceLinks)) return undefined;
  const links = details.sourceLinks.filter(
    (item): item is { label: string; url: string } =>
      Boolean(
        item &&
          typeof item === "object" &&
          "label" in item &&
          typeof item.label === "string" &&
          "url" in item &&
          typeof item.url === "string",
      ),
  );
  return links.length ? links : undefined;
}

export async function clearUserWorkspace(userId: string) {
  await db.transaction(async (tx) => {
    await tx.delete(importBatches).where(eq(importBatches.userId, userId));
    await tx.delete(portfolioTransactions).where(eq(portfolioTransactions.userId, userId));
    await tx.delete(spendingTransactions).where(eq(spendingTransactions.userId, userId));
    await tx.delete(spendingCarryovers).where(eq(spendingCarryovers.userId, userId));
    await tx.delete(alerts).where(eq(alerts.userId, userId));
    await tx.delete(tokenFlowEvents).where(eq(tokenFlowEvents.userId, userId));
    await tx.delete(watchlistWallets).where(eq(watchlistWallets.userId, userId));
    await tx.delete(signals).where(eq(signals.userId, userId));
    await tx.delete(aiConversations).where(eq(aiConversations.userId, userId));
  });
}
