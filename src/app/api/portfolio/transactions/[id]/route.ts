import type { NextRequest } from "next/server";
import { json, parseJson, withUser } from "@/server/api";
import { deletePortfolioTransaction, updatePortfolioTransaction } from "@/server/ledger";
import { portfolioTransactionSchema } from "@/server/validators";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export const PATCH = withUser<Context>(async (request: NextRequest, user, context) => {
  const { id } = await context.params;
  const input = await parseJson(request, portfolioTransactionSchema);
  return json(await updatePortfolioTransaction(user.id, id, input));
});

export const DELETE = withUser<Context>(async (_request: NextRequest, user, context) => {
  const { id } = await context.params;
  await deletePortfolioTransaction(user.id, id);
  return new Response(null, { status: 204 });
});
