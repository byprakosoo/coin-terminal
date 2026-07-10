import type { NextRequest } from "next/server";
import { withUser } from "@/server/api";
import { deleteConversation } from "@/server/conversations";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export const DELETE = withUser<Context>(async (_request: NextRequest, user, context) => {
  const { id } = await context.params;
  await deleteConversation(user.id, id);
  return new Response(null, { status: 204 });
});
