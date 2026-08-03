import type { NextRequest } from "next/server";
import { json, parseJson, withUser } from "@/server/api";
import { createGoldTransaction } from "@/server/portfolio-recap";
import { goldTransactionSchema } from "@/server/validators";

export const runtime = "nodejs";

export const POST = withUser(async (request: NextRequest, user) => {
  const input = await parseJson(request, goldTransactionSchema);
  return json(await createGoldTransaction(user.id, input), { status: 201 });
});
