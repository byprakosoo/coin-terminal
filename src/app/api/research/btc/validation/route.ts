import type { NextRequest } from "next/server";
import { enforceRateLimit, json, withUser } from "@/server/api";
import { getBtcStrategyProfile, runDefensiveHistoricalValidation } from "@/server/btc-strategy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = withUser(async (_request: NextRequest, user) => {
  const profile = await getBtcStrategyProfile(user.id);
  return json(profile.latestValidation ?? null);
});

export const POST = withUser(async (_request: NextRequest, user) => {
  await enforceRateLimit(`btc-validation:${user.id}`, { limit: 2, windowMs: 24 * 60 * 60 * 1000 });
  return json(await runDefensiveHistoricalValidation());
});
