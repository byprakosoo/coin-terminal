import type { NextRequest } from "next/server";
import { ApiError, json, parseJson, withUser } from "@/server/api";
import { deleteAiModelConfig, getAiModelConfig, setAiModelConfigActive } from "@/server/ai-models";
import { testAiModelConnection } from "@/server/ai-portfolio-assistant";
import { aiModelActivationSchema } from "@/server/validators";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = withUser<Context>(async (request: NextRequest, user, context) => {
  const { id } = await context.params;
  const input = await parseJson(request, aiModelActivationSchema);
  return json(await setAiModelConfigActive(user.id, id, input.active));
});

export const POST = withUser<Context>(async (_request: NextRequest, user, context) => {
  const { id } = await context.params;
  const config = await getAiModelConfig(user.id, id);
  const result = await testAiModelConnection(config);
  if (!result.ok) {
    throw new ApiError(502, modelTestFailureMessage(result.fallbackReason, result.providerStatus, result.providerError), "AI_MODEL_TEST_FAILED");
  }
  return json({ provider: config.label, model: config.model, response: result.content });
});

export const DELETE = withUser<Context>(async (_request: NextRequest, user, context) => {
  const { id } = await context.params;
  await deleteAiModelConfig(user.id, id);
  return new Response(null, { status: 204 });
});

function modelTestFailureMessage(reason: string | undefined, status?: number, providerError?: string) {
  switch (reason) {
    case "PROVIDER_AUTHENTICATION": return "The provider rejected this API key. Check the key and try again.";
    case "PROVIDER_BILLING": return "The provider requires billing or account verification before it can answer.";
    case "PROVIDER_RATE_LIMIT": return "The provider rate limit was reached. Try again later.";
    case "EMPTY_RESPONSE": return "The provider connected but returned no text.";
    default: return status ? `The provider rejected the request (HTTP ${status}${providerError ? `: ${providerError}` : ""}). Check the model ID and provider settings, then try again.` : providerError ? `The provider connection failed: ${providerError}` : "The provider could not be reached. Check the model ID and endpoint, then try again.";
  }
}
