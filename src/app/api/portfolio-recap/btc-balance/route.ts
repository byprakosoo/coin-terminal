import type { NextRequest } from "next/server";
import { json, parseJson, withUser } from "@/server/api";
import { getPortfolioRecap, saveBtcBalance } from "@/server/portfolio-recap";
import { btcBalanceSchema } from "@/server/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withUser(async (_request: NextRequest, user) => json((await getPortfolioRecap(user.id)).btcBalance ?? null));
export const PUT = withUser(async (request: NextRequest, user) => {
  const { quantity } = await parseJson(request, btcBalanceSchema);
  return json(await saveBtcBalance(user.id, quantity));
});
