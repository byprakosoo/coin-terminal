import type { NextRequest } from "next/server";
import { json, withUser } from "@/server/api";
import { getActiveAiModelConfig } from "@/server/ai-models";
import { getOpenAiCodexUsage } from "@/server/openai-codex";
import type { AiUsageSummary } from "@/lib/ai-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withUser(async (_request: NextRequest, user) => {
  const config = await getActiveAiModelConfig(user.id);
  if (!config) {
    return json<AiUsageSummary>({
      availability: "NOT_SUPPORTED",
      observedAt: new Date().toISOString(),
      message: "No AI model is active. Connect ChatGPT / Codex to read your account usage.",
    });
  }

  if (config.provider !== "OPENAI_CODEX") {
    return json<AiUsageSummary>({
      availability: "NOT_SUPPORTED",
      provider: config.provider,
      model: config.model,
      observedAt: new Date().toISOString(),
      message: "This provider does not expose a remaining-usage endpoint to Coin Terminal. Check the provider dashboard.",
    });
  }

  const usage = await getOpenAiCodexUsage({ accessToken: config.apiKey, accountId: config.accountId });
  return json<AiUsageSummary>({ ...usage, provider: config.provider, model: config.model });
});
