import type { NextRequest } from "next/server";
import { calculateSpending } from "@/lib/calculations";
import { monthKey } from "@/lib/format";
import { ApiError, json, withUser } from "@/server/api";
import { loadWorkspace } from "@/server/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withUser(async (request: NextRequest, user) => {
  const month = request.nextUrl.searchParams.get("month") ?? monthKey();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new ApiError(422, "Month must use YYYY-MM format.", "VALIDATION_ERROR");
  }
  const workspace = await loadWorkspace(user.id);
  return json(calculateSpending(workspace.spending, month, workspace.fxRates));
});
