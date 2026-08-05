import type { NextRequest } from "next/server";
import { json, withUser } from "@/server/api";
import { startOpenAiCodexDeviceLogin } from "@/server/openai-codex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withUser(async (_request: NextRequest, user) => {
  return json(await startOpenAiCodexDeviceLogin(user.id), { status: 201 });
});
