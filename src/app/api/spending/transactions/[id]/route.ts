import type { NextRequest } from "next/server";
import { parseJson, json, withUser } from "@/server/api";
import { deleteSpendingTransaction, updateSpendingTransaction } from "@/server/ledger";
import { spendingTransactionSchema } from "@/server/validators";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export const PATCH = withUser<Context>(async (request: NextRequest, user, context) => {
  const { id } = await context.params;
  const input = await parseJson(request, spendingTransactionSchema);
  return json(await updateSpendingTransaction(user.id, id, input));
});

export const DELETE = withUser<Context>(async (_request: NextRequest, user, context) => {
  const { id } = await context.params;
  await deleteSpendingTransaction(user.id, id);
  return new Response(null, { status: 204 });
});
