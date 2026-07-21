import type { NextRequest } from "next/server";
import { json, parseJson, withUser } from "@/server/api";
import { deletePortfolioRecapSnapshot, updatePortfolioRecapSnapshot } from "@/server/portfolio-recap";
import { portfolioRecapSnapshotSchema } from "@/server/validators";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export const PATCH = withUser<Context>(async (request: NextRequest, user, context) => {
  const { id } = await context.params;
  const input = await parseJson(request, portfolioRecapSnapshotSchema);
  return json(await updatePortfolioRecapSnapshot(user.id, id, input));
});

export const DELETE = withUser<Context>(async (_request: NextRequest, user, context) => {
  const { id } = await context.params;
  await deletePortfolioRecapSnapshot(user.id, id);
  return new Response(null, { status: 204 });
});
