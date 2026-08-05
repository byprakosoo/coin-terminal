import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiModelConfigs } from "@/db/schema";
import type { AiModelConfigInput, AiModelConfigSummary, AiModelProvider } from "@/lib/ai-models";
import { AI_MODEL_PRESETS } from "@/lib/ai-models";
import { ApiError } from "@/server/api";
import { createId } from "@/server/ids";
import { decryptCredential, encryptCredential, getOpenAiCodexCredential } from "@/server/openai-codex";

export interface ActiveAiModelConfig {
  label: string;
  provider: AiModelProvider;
  model: string;
  endpointUrl: string;
  apiKey: string;
  accountId?: string;
}

export async function listAiModelConfigs(userId: string): Promise<AiModelConfigSummary[]> {
  const rows = await db
    .select()
    .from(aiModelConfigs)
    .where(eq(aiModelConfigs.userId, userId))
    .orderBy(desc(aiModelConfigs.active), desc(aiModelConfigs.updatedAt));
  return rows.map(toSummary);
}

export async function getActiveAiModelConfig(userId: string): Promise<ActiveAiModelConfig | undefined> {
  const [row] = await db
    .select()
    .from(aiModelConfigs)
    .where(and(eq(aiModelConfigs.userId, userId), eq(aiModelConfigs.active, true)))
    .limit(1);
  if (!row) return undefined;
  let apiKey: string;
  let accountId: string | undefined;
  if (row.provider === "OPENAI_CODEX") {
    const credential = await getOpenAiCodexCredential(row);
    apiKey = credential.accessToken;
    accountId = credential.accountId;
  } else {
    try {
      apiKey = decryptCredential(row.apiKeyCiphertext);
    } catch {
      throw new ApiError(503, "The saved AI key cannot be decrypted. Save this model again.", "AI_CREDENTIALS_UNAVAILABLE");
    }
  }
  return {
    label: row.label,
    provider: row.provider,
    model: row.model,
    endpointUrl: row.endpointUrl,
    apiKey,
    accountId,
  };
}

export async function saveAiModelConfig(userId: string, input: AiModelConfigInput) {
  const provider = input.provider;
  if (provider === "OPENAI_CODEX") {
    throw new ApiError(422, "Connect ChatGPT using the OAuth button instead of an API key.", "OAUTH_REQUIRED");
  }
  const endpointUrl = provider === "OPENAI_COMPATIBLE"
    ? validateEndpoint(input.endpointUrl)
    : AI_MODEL_PRESETS[provider].endpointUrl;
  const label = input.label.trim();
  const model = input.model.trim();
  if (!label || !model) throw new ApiError(422, "Label and model are required.", "INVALID_AI_MODEL");

  const existing = input.id
    ? (await db
        .select()
        .from(aiModelConfigs)
        .where(and(eq(aiModelConfigs.id, input.id), eq(aiModelConfigs.userId, userId)))
        .limit(1))[0]
    : undefined;
  if (input.id && !existing) throw new ApiError(404, "AI model configuration not found.", "NOT_FOUND");

  const apiKey = input.apiKey?.trim();
  if (!existing && !apiKey) {
    throw new ApiError(422, "An API key is required for a new model configuration.", "API_KEY_REQUIRED");
  }

  const encrypted = apiKey ? encryptCredential(apiKey) : existing!.apiKeyCiphertext;
  const apiKeyHint = apiKey ? apiKey.slice(-4) : existing!.apiKeyHint;
  const id = existing?.id ?? createId();

  await db.transaction(async (tx) => {
    await tx
      .update(aiModelConfigs)
      .set({ active: false })
      .where(eq(aiModelConfigs.userId, userId));
    if (existing) {
      await tx
        .update(aiModelConfigs)
        .set({ label, provider, model, endpointUrl, apiKeyCiphertext: encrypted, apiKeyHint, active: true })
        .where(and(eq(aiModelConfigs.id, id), eq(aiModelConfigs.userId, userId)));
    } else {
      await tx.insert(aiModelConfigs).values({
        id,
        userId,
        label,
        provider,
        model,
        endpointUrl,
        apiKeyCiphertext: encrypted,
        apiKeyHint,
        active: true,
      });
    }
  });

  const [saved] = await db
    .select()
    .from(aiModelConfigs)
    .where(and(eq(aiModelConfigs.id, id), eq(aiModelConfigs.userId, userId)))
    .limit(1);
  return toSummary(saved!);
}

export async function setAiModelConfigActive(userId: string, id: string, active: boolean) {
  const [config] = await db
    .select({ id: aiModelConfigs.id })
    .from(aiModelConfigs)
    .where(and(eq(aiModelConfigs.id, id), eq(aiModelConfigs.userId, userId)))
    .limit(1);
  if (!config) throw new ApiError(404, "AI model configuration not found.", "NOT_FOUND");

  await db.transaction(async (tx) => {
    if (active) {
      await tx.update(aiModelConfigs).set({ active: false }).where(eq(aiModelConfigs.userId, userId));
    }
    await tx
      .update(aiModelConfigs)
      .set({ active })
      .where(and(eq(aiModelConfigs.id, id), eq(aiModelConfigs.userId, userId)));
  });
  return listAiModelConfigs(userId);
}

export async function deleteAiModelConfig(userId: string, id: string) {
  const result = await db
    .delete(aiModelConfigs)
    .where(and(eq(aiModelConfigs.id, id), eq(aiModelConfigs.userId, userId)));
  const affectedRows = Array.isArray(result)
    ? Number((result[0] as { affectedRows?: number })?.affectedRows ?? 0)
    : Number((result as { affectedRows?: number }).affectedRows ?? 0);
  if (!affectedRows) throw new ApiError(404, "AI model configuration not found.", "NOT_FOUND");
}

function toSummary(row: typeof aiModelConfigs.$inferSelect): AiModelConfigSummary {
  return {
    id: row.id,
    label: row.label,
    provider: row.provider,
    model: row.model,
    endpointUrl: row.endpointUrl,
    hasApiKey: true,
    apiKeyHint: row.apiKeyHint,
    active: row.active,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function validateEndpoint(value: string | undefined) {
  if (!value?.trim()) {
    throw new ApiError(422, "An HTTPS endpoint is required for OpenAI-compatible models.", "ENDPOINT_REQUIRED");
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ApiError(422, "Enter a valid HTTPS endpoint URL.", "INVALID_ENDPOINT");
  }
  const hostname = url.hostname.toLowerCase();
  const privateHost =
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".local") ||
    hostname.startsWith("127.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
  if (url.protocol !== "https:" || url.username || url.password || privateHost) {
    throw new ApiError(422, "The custom endpoint must be a public HTTPS URL.", "INVALID_ENDPOINT");
  }
  return url.toString().replace(/\/$/, "");
}
