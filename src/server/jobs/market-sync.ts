import "server-only";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  dataSources,
  marketSnapshots,
  signalEvidence,
  signalRuleVersions,
  signals,
  users,
} from "@/db/schema";
import { fetchBtcDailyPrices, fetchCryptoTickers } from "@/server/providers/coingecko";
import { payloadHash, stableId } from "@/server/ids";
import { generateBtcSignal, movingAverageSeries } from "@/server/signal-engine";
import { providerIds } from "@/server/workspace";

const liveRuleVersion = "btc-daily-v1.4.0";
const liveRuleVersionId = stableId("signal-rule", liveRuleVersion);

export async function syncMarketData() {
  const [recentSnapshot] = await db
    .select({ id: marketSnapshots.id, fetchedAt: marketSnapshots.fetchedAt })
    .from(marketSnapshots)
    .where(
      and(
        eq(marketSnapshots.dataSourceId, providerIds.coingecko),
        eq(marketSnapshots.snapshotType, "TICKER"),
        gt(marketSnapshots.fetchedAt, new Date(Date.now() - 15 * 60 * 1000)),
      ),
    )
    .orderBy(desc(marketSnapshots.fetchedAt))
    .limit(1);
  if (recentSnapshot) {
    return {
      provider: "CoinGecko",
      cached: true,
      snapshotId: recentSnapshot.id,
      fetchedAt: recentSnapshot.fetchedAt.toISOString(),
    };
  }

  const [tickers, rawCloses] = await Promise.all([fetchCryptoTickers(), fetchBtcDailyPrices(90)]);
  const today = new Date().toISOString().slice(0, 10);
  const completedCloses = rawCloses.filter((point) => point.date < today);
  if (completedCloses.length < 51) {
    throw new Error("CoinGecko did not return enough completed BTC daily candles.");
  }
  const series = movingAverageSeries(completedCloses);
  const now = new Date();
  const tickerSnapshotIds = new Map<string, string>();
  const candleSnapshotIds = new Map<string, string>();

  await db.transaction(async (tx) => {
    await tx
      .insert(dataSources)
      .values({
        id: providerIds.coingecko,
        provider: "CoinGecko",
        sourceUrl: "https://api.coingecko.com/api/v3",
        enabled: true,
      })
      .onDuplicateKeyUpdate({ set: { enabled: true } });
    await tx
      .insert(signalRuleVersions)
      .values({
        id: liveRuleVersionId,
        version: liveRuleVersion,
        active: true,
        configuration: {
          thresholds: { buy: 70, sell: 30 },
          volatilityKillThresholdPct: 95,
          staleAfterHours: 24,
          weights: { momentum: 30, trend: 25, meanReversion: 20, volatility: 15, wallets: 10 },
        },
      })
      .onDuplicateKeyUpdate({ set: { active: true } });
    await tx
      .update(signalRuleVersions)
      .set({ active: false })
      .where(sql`${signalRuleVersions.id} <> ${liveRuleVersionId}`);

    for (const ticker of tickers) {
      const payload = {
        assetSymbol: ticker.assetSymbol,
        name: ticker.name,
        priceUsd: ticker.priceUsd,
        dailyChangePct: ticker.dailyChangePct,
      };
      const hash = payloadHash(payload);
      const id = stableId("live-ticker", `${ticker.assetSymbol}:${hash}`);
      tickerSnapshotIds.set(ticker.assetSymbol, id);
      await tx
        .insert(marketSnapshots)
        .values({
          id,
          dataSourceId: providerIds.coingecko,
          instrument: `${ticker.assetSymbol}/USD`,
          snapshotType: "TICKER",
          observedAt: ticker.observedAt,
          fetchedAt: now,
          freshnessStatus:
            now.getTime() - ticker.observedAt.getTime() <= 15 * 60 * 1000 ? "FRESH" : "DELAYED",
          payload,
          payloadHash: hash,
        })
        .onDuplicateKeyUpdate({ set: { id: sql`${marketSnapshots.id}` } });
    }

    for (const point of series) {
      const payload = {
        date: point.date,
        close: point.close,
        ma20: point.ma20,
        ma50: point.ma50,
      };
      const hash = payloadHash(payload);
      const id = stableId("live-candle", `${point.date}:${hash}`);
      candleSnapshotIds.set(point.date, id);
      await tx
        .insert(marketSnapshots)
        .values({
          id,
          dataSourceId: providerIds.coingecko,
          instrument: "BTC/USD",
          snapshotType: "DAILY_CANDLE",
          observedAt: new Date(`${point.date}T23:59:59.999Z`),
          fetchedAt: now,
          freshnessStatus: "FRESH",
          payload,
          payloadHash: hash,
        })
        .onDuplicateKeyUpdate({ set: { id: sql`${marketSnapshots.id}` } });
    }
  });

  const generated = generateBtcSignal(
    completedCloses.map((point) => ({
      ...point,
      observedAt: new Date(`${point.date}T23:59:59.999Z`),
    })),
    { now },
  );
  const btcTicker = tickers.find((ticker) => ticker.assetSymbol === "BTC");
  if (!btcTicker) throw new Error("BTC ticker is missing.");
  const latestDate = completedCloses.at(-1)!.date;
  const evaluatedAt = new Date(`${latestDate}T23:59:59.999Z`);
  const expiresAt = new Date(evaluatedAt.getTime() + 24 * 60 * 60 * 1000);
  const userRows = await db.select({ id: users.id }).from(users);

  for (const user of userRows) {
    const signalId = stableId(user.id, `live-signal:${latestDate}:${liveRuleVersion}`);
    await db.transaction(async (tx) => {
      await tx
        .insert(signals)
        .values({
          id: signalId,
          userId: user.id,
          ruleVersionId: liveRuleVersionId,
          instrument: "BTC/USD",
          action: generated.action,
          compositeScore: generated.compositeScore,
          confidence: generated.confidencePct,
          freshnessStatus: generated.freshness,
          summary: generated.summary,
          priceUsd: btcTicker.priceUsd,
          change24hPct: btcTicker.dailyChangePct,
          evaluatedAt,
          expiresAt,
        })
        .onDuplicateKeyUpdate({ set: { id: sql`${signals.id}` } });
      await tx.delete(signalEvidence).where(eq(signalEvidence.signalId, signalId));
      await tx.insert(signalEvidence).values(
        generated.evidence.map((evidence, index) => ({
          id: stableId(signalId, `evidence:${index}:${evidence.group}`),
          signalId,
          marketSnapshotId:
            evidence.kind === "OBSERVED"
              ? tickerSnapshotIds.get("BTC")
              : candleSnapshotIds.get(latestDate),
          groupName: evidence.group,
          ruleName: evidence.rule,
          weightPct: evidence.weightPct,
          score: evidence.score,
          value: evidence.value,
          interpretation: evidence.interpretation,
          sourceLabel: evidence.source,
          sourceUrl: evidence.sourceUrl,
          observedAt: evidence.observedAt,
          evidenceKind: evidence.kind,
          details: evidence.details,
        })),
      );
    });
  }

  return {
    provider: "CoinGecko",
    tickerSnapshots: tickers.length,
    dailySnapshots: series.length,
    signalsGenerated: userRows.length,
    signalDate: latestDate,
    action: generated.action,
    compositeScore: generated.compositeScore,
    riskKillSwitch: generated.riskKillSwitch,
  };
}
