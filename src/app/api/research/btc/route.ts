import type { NextRequest } from "next/server";
import { json, withUser } from "@/server/api";
import { loadWorkspace } from "@/server/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withUser(async (_request: NextRequest, user) => {
  const workspace = await loadWorkspace(user.id);
  return json({
    current: workspace.signals[0] ?? null,
    history: workspace.signals,
    marketHistory: workspace.marketHistory,
    price: workspace.prices.find((price) => price.assetSymbol === "BTC") ?? null,
  });
});
