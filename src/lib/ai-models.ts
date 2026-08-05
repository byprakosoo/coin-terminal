export type AiModelProvider = "OPENAI" | "ANTHROPIC" | "KIMI" | "OPENAI_COMPATIBLE";

export interface AiModelConfigSummary {
  id: string;
  label: string;
  provider: AiModelProvider;
  model: string;
  endpointUrl: string;
  hasApiKey: boolean;
  apiKeyHint?: string;
  active: boolean;
  updatedAt: string;
}

export interface AiModelConfigInput {
  id?: string;
  label: string;
  provider: AiModelProvider;
  model: string;
  endpointUrl?: string;
  apiKey?: string;
}

export const AI_MODEL_PRESETS: Record<AiModelProvider, {
  label: string;
  endpointUrl: string;
  modelPlaceholder: string;
  help: string;
}> = {
  OPENAI: {
    label: "OpenAI",
    endpointUrl: "https://api.openai.com/v1/responses",
    modelPlaceholder: "gpt-5 or gpt-4o-mini",
    help: "OpenAI Responses API",
  },
  ANTHROPIC: {
    label: "Claude / Anthropic",
    endpointUrl: "https://api.anthropic.com/v1/messages",
    modelPlaceholder: "claude-sonnet-4-20250514",
    help: "Anthropic Messages API",
  },
  KIMI: {
    label: "Kimi / Moonshot",
    endpointUrl: "https://api.moonshot.ai/v1/chat/completions",
    modelPlaceholder: "kimi-k2.5",
    help: "Kimi OpenAI-compatible Chat Completions API",
  },
  OPENAI_COMPATIBLE: {
    label: "OpenAI-compatible",
    endpointUrl: "",
    modelPlaceholder: "provider/model-name",
    help: "Custom HTTPS Chat Completions endpoint",
  },
};

export function aiModelProviderLabel(provider: AiModelProvider) {
  return AI_MODEL_PRESETS[provider].label;
}
