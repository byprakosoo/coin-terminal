import "server-only";
import Decimal from "decimal.js";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  alerts,
  dataSources,
  marketSnapshots,
  tokenFlowEvents,
  tokenFlowEventWallets,
  walletEvents,
  watchlistWallets,
} from "@/db/schema";
import { classifyLateEntry } from "@/server/late-entry";
import { fetchBestDexPair } from "@/server/providers/dex-screener";
import { payloadHash, stableId } from "@/server/ids";
import { providerIds } from "@/server/workspace";

const qualifiedClassifications = [
  "USER_VERIFIED",
  "PUBLICLY_ATTRIBUTED",
  "HIGH_PERFORMANCE_PROXY",
] as const;
const chainIds: Record<string, string | undefined> = {
  Ethereum: "ethereum",
  Base: "base",
  Arbitrum: "arbitrum",
};

interface Group {
  chain: string;
  tokenAddress: string;
  tokenSymbol: string;
  events: Array<{
    walletId: string;
    transactionHash: string;
    eventType: "BUY" | "SELL";
    valueUsd: string;
    occurredAt: Date;
    sourceUrl: string;
  }>;
}

export async function evaluateSmartMoneyForUser(userId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ event: walletEvents, wallet: watchlistWallets })
    .from(walletEvents)
    .innerJoin(watchlistWallets, eq(watchlistWallets.id, walletEvents.watchlistWalletId))
    .where(
      and(
        eq(watchlistWallets.userId, userId),
        eq(watchlistWallets.enabled, true),
        inArray(watchlistWallets.classification, [...qualifiedClassifications]),
        inArray(walletEvents.eventType, ["BUY", "SELL"]),
        gte(walletEvents.occurredAt, since),
      ),
    );
  const groups = new Map<string, Group>();
  for (const { event } of rows) {
    const key = `${event.chain}:${event.tokenAddress.toLowerCase()}`;
    const group = groups.get(key) ?? {
      chain: event.chain,
      tokenAddress: event.tokenAddress,
      tokenSymbol: event.tokenSymbol,
      events: [],
    };
    group.events.push({
      walletId: event.watchlistWalletId,
      transactionHash: event.transactionHash,
      eventType: event.eventType as "BUY" | "SELL",
      valueUsd: event.valueUsd,
      occurredAt: event.occurredAt,
      sourceUrl: event.sourceUrl,
    });
    groups.set(key, group);
  }

  await db
    .insert(dataSources)
    .values({
      id: providerIds.dexScreener,
      provider: "DEX Screener",
      sourceUrl: "https://api.dexscreener.com",
      enabled: true,
    })
    .onDuplicateKeyUpdate({ set: { enabled: true } });

  let evaluated = 0;
  let alertsCreated = 0;
  for (const group of [...groups.values()].slice(0, 20)) {
    const walletIds = [...new Set(group.events.filter((event) => event.eventType === "BUY").map((event) => event.walletId))];
    const netBuyUsd = group.events.reduce(
      (total, event) =>
        event.eventType === "BUY" ? total.add(event.valueUsd) : total.sub(event.valueUsd),
      new Decimal(0),
    );
    const singleLargeBuy = group.events.some(
      (event) => event.eventType === "BUY" && new Decimal(event.valueUsd).gte(100_000),
    );
    if (netBuyUsd.lte(0) || (walletIds.length < 2 && !singleLargeBuy)) continue;
    const chainId = chainIds[group.chain];
    if (!chainId) continue;
    const pair = await fetchBestDexPair(chainId, group.tokenAddress);
    if (!pair) continue;

    const firstDetectedAt = group.events.reduce(
      (earliest, event) => (event.occurredAt < earliest ? event.occurredAt : earliest),
      group.events[0].occurredAt,
    );
    const evaluatedAt = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000);
    const lateEntry = classifyLateEntry({
      qualifiedWalletCount: walletIds.length,
      priceChangePct: pair.change24hPct,
      liquidityUsd: pair.liquidityUsd,
      pairAgeHours: pair.pairCreatedAt
        ? new Decimal(Date.now() - pair.pairCreatedAt.getTime()).div(3_600_000).toString()
        : undefined,
      sourceFresh: true,
    });
    const score = Decimal.min(
      100,
      new Decimal(45)
        .add(walletIds.length * 10)
        .add(Decimal.min(25, netBuyUsd.div(Decimal.max(pair.liquidityUsd, 1)).mul(100))),
    ).toFixed(2);
    const pairPayload = {
      tokenAddress: group.tokenAddress,
      pairAddress: pair.pairAddress,
      pairLabel: pair.pairLabel,
      priceUsd: pair.priceUsd,
      liquidityUsd: pair.liquidityUsd,
      volume24hUsd: pair.volume24hUsd,
      change24hPct: pair.change24hPct,
      sourceUrl: pair.sourceUrl,
    };
    const pairHash = payloadHash(pairPayload);
    const snapshotId = stableId("dex-pair", `${chainId}:${group.tokenAddress}:${pairHash}`);
    const eventId = stableId(
      userId,
      `flow:${group.chain}:${group.tokenAddress}:${evaluatedAt.toISOString()}`,
    );
    const sourceLinks = [
      { label: "DEX Screener pair", url: pair.sourceUrl },
      ...group.events.slice(0, 10).map((event) => ({
        label: `Public transaction ${event.transactionHash.slice(0, 10)}…`,
        url: event.sourceUrl,
      })),
    ];

    await db.transaction(async (tx) => {
      await tx
        .insert(marketSnapshots)
        .values({
          id: snapshotId,
          dataSourceId: providerIds.dexScreener,
          instrument: `${group.chain}:${group.tokenAddress}`,
          snapshotType: "DEX_PAIR",
          observedAt: new Date(),
          freshnessStatus: "FRESH",
          payload: pairPayload,
          payloadHash: pairHash,
        })
        .onDuplicateKeyUpdate({ set: { id: sql`${marketSnapshots.id}` } });
      await tx
        .insert(tokenFlowEvents)
        .values({
          id: eventId,
          userId,
          chain: group.chain,
          tokenAddress: group.tokenAddress,
          tokenSymbol: pair.tokenSymbol || group.tokenSymbol,
          tokenName: pair.tokenName,
          dexPair: pair.pairLabel,
          entryStatus: lateEntry.status,
          smartMoneyScore: score,
          qualifiedWalletCount: walletIds.length,
          netBuyUsd: netBuyUsd.toString(),
          priceChangeSinceFirstBuy: pair.change24hPct,
          liquidityUsd: pair.liquidityUsd,
          volume24hUsd: pair.volume24hUsd,
          firstDetectedAt,
          evaluatedAt,
          riskFactors: lateEntry.riskFactors,
          sourceLinks,
          evidence: {
            marketSnapshotId: snapshotId,
            walletEventCount: group.events.length,
            qualification: "public-wallet proxy",
            priceChangeApproximation: "DEX Screener 24h change",
          },
        })
        .onDuplicateKeyUpdate({ set: { id: sql`${tokenFlowEvents.id}` } });
      for (const walletId of walletIds) {
        await tx
          .insert(tokenFlowEventWallets)
          .values({ tokenFlowEventId: eventId, watchlistWalletId: walletId })
          .onDuplicateKeyUpdate({
            set: { watchlistWalletId: sql`${tokenFlowEventWallets.watchlistWalletId}` },
          });
      }
    });
    evaluated += 1;

    const alertType =
      lateEntry.status === "EARLY"
        ? "SMART_MONEY_EARLY"
        : lateEntry.status === "EXTENDED" || lateEntry.status === "AVOID"
          ? "LATE_ENTRY_RISK"
          : undefined;
    if (alertType) {
      const cooldownKey = `${group.chain}:${group.tokenAddress.toLowerCase()}:${alertType}`;
      const [recent] = await db
        .select({ id: alerts.id })
        .from(alerts)
        .where(
          and(
            eq(alerts.userId, userId),
            eq(alerts.cooldownKey, cooldownKey),
            gte(alerts.createdAt, since),
          ),
        )
        .limit(1);
      if (!recent) {
        await db.insert(alerts).values({
          id: stableId(eventId, alertType),
          userId,
          tokenFlowEventId: eventId,
          alertType,
          severity:
            lateEntry.status === "AVOID" || lateEntry.status === "EXTENDED" ? "HIGH_RISK" : "INFO",
          title: `${pair.tokenSymbol} is ${lateEntry.status}`,
          description: lateEntry.riskFactors.join(" · "),
          cooldownKey,
        });
        alertsCreated += 1;
      }
    }
  }
  return { candidates: groups.size, evaluated, alertsCreated };
}
