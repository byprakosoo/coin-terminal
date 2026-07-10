import type { NextRequest } from "next/server";
import { json, parseJson, withUser } from "@/server/api";
import { createSpendingTransaction, listSpendingTransactions } from "@/server/ledger";
import { spendingTransactionSchema } from "@/server/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withUser(async (_request: NextRequest, user) => {
  return json(await listSpendingTransactions(user.id));
});

export const POST = withUser(async (request: NextRequest, user) => {
  const input = await parseJson(request, spendingTransactionSchema);
  return json(await createSpendingTransaction(user.id, input), { status: 201 });
});
