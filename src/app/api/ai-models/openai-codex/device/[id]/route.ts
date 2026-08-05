import type { NextRequest } from "next/server";
import { json, withUser } from "@/server/api";
import { pollOpenAiCodexDeviceLogin } from "@/server/openai-codex";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withUser<Context>(async (_request: NextRequest, user, context) => {
  const { id } = await context.params;
  return json(await pollOpenAiCodexDeviceLogin(user.id, id));
});
