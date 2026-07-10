import { and, desc, eq, lte } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { marketSnapshots } from "@/db/schema";
import { ApiError, json, withUser } from "@/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withUser(async (request: NextRequest) => {
  const asset = (request.nextUrl.searchParams.get("asset") ?? "BTC").toUpperCase();
  const atValue = request.nextUrl.searchParams.get("at");
  const at = atValue ? new Date(atValue) : new Date();
  if (!/^[A-Z0-9]{2,20}$/.test(asset) || Number.isNaN(at.getTime())) {
    throw new ApiError(422, "Asset or timestamp is invalid.", "VALIDATION_ERROR");
  }
  const recent = Date.now() - at.getTime() < 24 * 60 * 60 * 1000;
  const [snapshot] = await db
    .select()
    .from(marketSnapshots)
    .where(
      and(
        eq(marketSnapshots.instrument, `${asset}/USD`),
        eq(marketSnapshots.snapshotType, recent ? "TICKER" : "DAILY_CANDLE"),
        lte(marketSnapshots.observedAt, at),
      ),
    )
    .orderBy(desc(marketSnapshots.observedAt))
    .limit(1);
  if (!snapshot) throw new ApiError(404, "No market price is available for that time.", "NOT_FOUND");
  const payload = snapshot.payload as Record<string, unknown>;
  return json({
    assetSymbol: asset,
    priceUsd: String(payload.priceUsd ?? payload.close ?? "0"),
    observedAt: snapshot.observedAt.toISOString(),
    freshness: snapshot.freshnessStatus,
    source: "CoinGecko public market snapshot",
    snapshotId: snapshot.id,
  });
});
