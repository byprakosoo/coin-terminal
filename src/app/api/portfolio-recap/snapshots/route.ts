import type { NextRequest } from "next/server";
import { json, parseJson, withUser } from "@/server/api";
import { createPortfolioRecapSnapshot } from "@/server/portfolio-recap";
import { portfolioRecapSnapshotSchema } from "@/server/validators";

export const runtime = "nodejs";

export const POST = withUser(async (request: NextRequest, user) => {
  const input = await parseJson(request, portfolioRecapSnapshotSchema);
  return json(await createPortfolioRecapSnapshot(user.id, input), { status: 201 });
});
