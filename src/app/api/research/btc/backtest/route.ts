import type { NextRequest } from "next/server";
import { enforceRateLimit, json, withUser } from "@/server/api";
import { getBtcStrategyProfile } from "@/server/btc-strategy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withUser(async (_request: NextRequest, user) => {
  await enforceRateLimit(`btc-backtest:${user.id}`, { limit: 30, windowMs: 60 * 60 * 1000 });
  const profile = await getBtcStrategyProfile(user.id);
  return json(profile.latestValidation ?? null);
});
