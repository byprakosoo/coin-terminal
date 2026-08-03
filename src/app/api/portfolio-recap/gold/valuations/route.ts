import type { NextRequest } from "next/server";
import { json, parseJson, withUser } from "@/server/api";
import { createGoldValuation } from "@/server/portfolio-recap";
import { goldValuationSchema } from "@/server/validators";

export const runtime = "nodejs";

export const POST = withUser(async (request: NextRequest, user) => {
  const input = await parseJson(request, goldValuationSchema);
  return json(await createGoldValuation(user.id, input), { status: 201 });
});
