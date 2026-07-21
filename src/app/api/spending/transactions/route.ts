import type { NextRequest } from "next/server";
import { json, parseJson, withUser } from "@/server/api";
import { createSpendingTransaction, deleteSpendingTransactions, deleteSpendingTransactionsForMonth, listSpendingTransactions } from "@/server/ledger";
import { spendingDeleteSchema, spendingTransactionSchema } from "@/server/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withUser(async (_request: NextRequest, user) => {
  return json(await listSpendingTransactions(user.id));
});

export const POST = withUser(async (request: NextRequest, user) => {
  const input = await parseJson(request, spendingTransactionSchema);
  return json(await createSpendingTransaction(user.id, input), { status: 201 });
});

export const DELETE = withUser(async (request: NextRequest, user) => {
  const body = await parseJson(request, spendingDeleteSchema);
  if ("month" in body) {
    const { month } = body;
    return json({ deleted: await deleteSpendingTransactionsForMonth(user.id, month) });
  }
  const { ids } = body;
  return json({ deleted: await deleteSpendingTransactions(user.id, ids) });
});
