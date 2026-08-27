import type { NextRequest } from "next/server";
import { json, parseJson, withUser } from "@/server/api";
import {
  deleteGoldTransaction,
  updateGoldTransaction,
} from "@/server/portfolio-recap";
import { goldTransactionSchema } from "@/server/validators";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export const PATCH = withUser<Context>(async (request: NextRequest, user, context) => {
  const { id } = await context.params;
  const input = await parseJson(request, goldTransactionSchema);
  return json(await updateGoldTransaction(user.id, id, input));
});

export const DELETE = withUser<Context>(async (_request: NextRequest, user, context) => {
  const { id } = await context.params;
  await deleteGoldTransaction(user.id, id);
  return new Response(null, { status: 204 });
});
