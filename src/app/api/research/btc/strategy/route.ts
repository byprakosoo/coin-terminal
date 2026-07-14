import type { NextRequest } from "next/server";
import { json, parseJson, withUser } from "@/server/api";
import { getBtcStrategyProfile, updateBtcStrategyBudget } from "@/server/btc-strategy";
import { btcStrategyBudgetSchema } from "@/server/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withUser(async (_request: NextRequest, user) =>
  json(await getBtcStrategyProfile(user.id)),
);

export const PATCH = withUser(async (request: NextRequest, user) => {
  const input = await parseJson(request, btcStrategyBudgetSchema);
  return json(await updateBtcStrategyBudget(user.id, input.sleeveBudgetUsd));
});
