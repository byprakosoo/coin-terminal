import type { NextRequest } from "next/server";
import { after } from "next/server";
import { json, withUser } from "@/server/api";
import { loadWorkspace, refreshMarketData } from "@/server/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withUser(async (_request: NextRequest, user) => {
  after(() => refreshMarketData());
  return json(await loadWorkspace(user.id));
});
