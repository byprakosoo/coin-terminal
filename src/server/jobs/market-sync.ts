import "server-only";
import Decimal from "decimal.js";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { dataSources, marketSnapshots } from "@/db/schema";
import { fetchBtcDailyPrices, fetchCryptoTickers } from "@/server/providers/coingecko";
import { payloadHash, stableId } from "@/server/ids";
import { movingAverageSeries } from "@/server/signal-engine";
import { providerIds } from "@/server/constants";

export async function syncMarketData() {
  const [recentSnapshot] = await db
    .select({ id: marketSnapshots.id, fetchedAt: marketSnapshots.fetchedAt })
    .from(marketSnapshots)
    .where(
      and(
        eq(marketSnapshots.dataSourceId, providerIds.coingecko),
        eq(marketSnapshots.snapshotType, "TICKER"),
        gt(marketSnapshots.fetchedAt, new Date(Date.now() - 60 * 1000)),
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

  const [tickers, recentDailySnapshot] = await Promise.all([
    fetchCryptoTickers(),
    db
      .select({ id: marketSnapshots.id })
      .from(marketSnapshots)
      .where(
        and(
          eq(marketSnapshots.dataSourceId, providerIds.coingecko),
          eq(marketSnapshots.snapshotType, "DAILY_CANDLE"),
          gt(marketSnapshots.fetchedAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
        ),
      )
      .limit(1),
  ]);
  const rawCloses = recentDailySnapshot.length ? [] : await fetchBtcDailyPrices(90);
  const today = new Date().toISOString().slice(0, 10);
  const completedCloses = rawCloses.filter((point) => point.date < today);
  if (rawCloses.length && completedCloses.length < 51) {
    throw new Error("CoinGecko did not return enough completed BTC daily candles.");
  }
  const series = movingAverageSeries(completedCloses);
  const now = new Date();

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
    for (const ticker of tickers) {
      const payload = {
        assetSymbol: ticker.assetSymbol,
        name: ticker.name,
        priceUsd: ticker.priceUsd,
        priceIdr: ticker.priceIdr,
        dailyChangePct: ticker.dailyChangePct,
      };
      const hash = payloadHash(payload);
      const id = stableId("live-ticker", `${ticker.assetSymbol}:${hash}`);
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
        .onDuplicateKeyUpdate({ set: { id: sql`${marketSnapshots.id}`, observedAt: ticker.observedAt, fetchedAt: now, freshnessStatus: now.getTime() - ticker.observedAt.getTime() <= 15 * 60 * 1000 ? "FRESH" : "DELAYED", payload } });
    }

    const btcTicker = tickers.find((ticker) => ticker.assetSymbol === "BTC");
    if (btcTicker?.priceIdr) {
      const usdRate = new Decimal(btcTicker.priceIdr).div(btcTicker.priceUsd).toString();
      const payload = { currency: "IDR", usdRate };
      const hash = payloadHash(payload);
      await tx
        .insert(marketSnapshots)
        .values({
          id: stableId("live-fx", `IDR:${hash}`),
          dataSourceId: providerIds.coingecko,
          instrument: "USD/IDR",
          snapshotType: "FX",
          observedAt: btcTicker.observedAt,
          fetchedAt: now,
          freshnessStatus:
            now.getTime() - btcTicker.observedAt.getTime() <= 15 * 60 * 1000 ? "FRESH" : "DELAYED",
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

  return {
    provider: "CoinGecko",
    tickerSnapshots: tickers.length,
    dailySnapshots: series.length,
    signalsGenerated: 0,
    strategySignalJob: "btc-strategy-daily",
  };
}
