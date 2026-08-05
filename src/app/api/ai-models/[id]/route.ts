import type { NextRequest } from "next/server";
import { json, parseJson, withUser } from "@/server/api";
import { deleteAiModelConfig, setAiModelConfigActive } from "@/server/ai-models";
import { aiModelActivationSchema } from "@/server/validators";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withUser<Context>(async (request: NextRequest, user, context) => {
  const { id } = await context.params;
  const input = await parseJson(request, aiModelActivationSchema);
  return json(await setAiModelConfigActive(user.id, id, input.active));
});

export const DELETE = withUser<Context>(async (_request: NextRequest, user, context) => {
  const { id } = await context.params;
  await deleteAiModelConfig(user.id, id);
  return new Response(null, { status: 204 });
});
