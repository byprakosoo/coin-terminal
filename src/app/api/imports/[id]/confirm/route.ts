import type { NextRequest } from "next/server";
import { enforceRateLimit, json, withUser } from "@/server/api";
import { confirmImport } from "@/server/import-service";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export const POST = withUser<Context>(async (_request: NextRequest, user, context) => {
  await enforceRateLimit(`import-confirm:${user.id}`, { limit: 10, windowMs: 60 * 60 * 1000 });
  const { id } = await context.params;
  return json(await confirmImport(user.id, id));
});
