import type { NextRequest } from "next/server";
import { json, parseJson, withUser } from "@/server/api";
import { reconcileDefensiveSignal } from "@/server/btc-strategy";
import { signalReconciliationSchema } from "@/server/validators";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withUser<Context>(async (request: NextRequest, user, context) => {
  const { id } = await context.params;
  const input = await parseJson(request, signalReconciliationSchema);
  return json(await reconcileDefensiveSignal(user.id, id, input));
});
