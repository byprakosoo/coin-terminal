import type { NextRequest } from "next/server";
import { enforceRateLimit, json, parseJson, withUser } from "@/server/api";
import { listConversationMessages, sendConversationMessage } from "@/server/conversations";
import { assistantMessageSchema } from "@/server/validators";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withUser<Context>(async (_request: NextRequest, user, context) => {
  const { id } = await context.params;
  return json(await listConversationMessages(user.id, id));
});

export const POST = withUser<Context>(async (request: NextRequest, user, context) => {
  await enforceRateLimit(`assistant:${user.id}`, { limit: 30, windowMs: 60 * 60 * 1000 });
  const { id } = await context.params;
  const input = await parseJson(request, assistantMessageSchema);
  return json(await sendConversationMessage(user.id, id, input.content), { status: 201 });
});
