import type { NextRequest } from "next/server";
import { json, parseJson, withUser } from "@/server/api";
import { createPortfolioTransaction, listPortfolioTransactions } from "@/server/ledger";
import { portfolioTransactionSchema } from "@/server/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withUser(async (_request: NextRequest, user) => {
  return json(await listPortfolioTransactions(user.id));
});

export const POST = withUser(async (request: NextRequest, user) => {
  const input = await parseJson(request, portfolioTransactionSchema);
  return json(await createPortfolioTransaction(user.id, input), { status: 201 });
});
