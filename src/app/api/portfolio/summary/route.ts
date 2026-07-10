import type { NextRequest } from "next/server";
import { calculatePortfolio } from "@/lib/calculations";
import { json, withUser } from "@/server/api";
import { loadWorkspace } from "@/server/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withUser(async (_request: NextRequest, user) => {
  const workspace = await loadWorkspace(user.id);
  return json(calculatePortfolio(workspace.transactions, workspace.prices));
});
