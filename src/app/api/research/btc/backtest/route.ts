import type { NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import { backtestBtcSignal } from "@/lib/btc-backtest";
import { enforceRateLimit, json, withUser } from "@/server/api";
import { fetchBtcDailyPrices } from "@/server/providers/coingecko";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const getBacktest = unstable_cache(
  async () => {
    const today = new Date().toISOString().slice(0, 10);
    const closes = (await fetchBtcDailyPrices(365)).filter((point) => point.date < today);
    return backtestBtcSignal(closes);
  },
  ["btc-signal-backtest-v1"],
  { revalidate: 60 * 60 },
);

export const GET = withUser(async (_request: NextRequest, user) => {
  await enforceRateLimit(`btc-backtest:${user.id}`, { limit: 30, windowMs: 60 * 60 * 1000 });
  return json(await getBacktest());
});
