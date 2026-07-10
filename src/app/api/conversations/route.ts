import type { NextRequest } from "next/server";
import { json, parseJson, withUser } from "@/server/api";
import { createConversation } from "@/server/conversations";
import { conversationSchema } from "@/server/validators";
import { loadWorkspace } from "@/server/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withUser(async (_request: NextRequest, user) => {
  return json((await loadWorkspace(user.id)).conversations);
});

export const POST = withUser(async (request: NextRequest, user) => {
  const input = await parseJson(request, conversationSchema);
  return json(await createConversation(user.id, input.title), { status: 201 });
});
