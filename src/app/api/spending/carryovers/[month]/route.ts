import type { NextRequest } from "next/server";
import { json, parseJson, withUser } from "@/server/api";
import { deleteSpendingCarryover, upsertSpendingCarryover } from "@/server/spending-carryovers";
import { spendingCarryoverSchema, spendingMonthSchema } from "@/server/validators";

type Context = { params: Promise<{ month: string }> };

export const runtime = "nodejs";

export const PATCH = withUser<Context>(async (request: NextRequest, user, context) => {
  const { month } = spendingMonthSchema.parse(await context.params);
  const input = await parseJson(request, spendingCarryoverSchema);
  return json(await upsertSpendingCarryover(user.id, month, input));
});

export const DELETE = withUser<Context>(async (_request: NextRequest, user, context) => {
  const { month } = spendingMonthSchema.parse(await context.params);
  await deleteSpendingCarryover(user.id, month);
  return new Response(null, { status: 204 });
});
