import type { NextRequest } from "next/server";
import { json, parseJson, withUser } from "@/server/api";
import { listAiModelConfigs, saveAiModelConfig } from "@/server/ai-models";
import { aiModelConfigSchema } from "@/server/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withUser(async (_request: NextRequest, user) => {
  return json(await listAiModelConfigs(user.id));
});

export const POST = withUser(async (request: NextRequest, user) => {
  const input = await parseJson(request, aiModelConfigSchema);
  return json(await saveAiModelConfig(user.id, input), { status: 201 });
});
