import type { AiModelProvider } from "@/lib/ai-models";

export type AiUsageAvailability = "AVAILABLE" | "UNAVAILABLE" | "NOT_SUPPORTED";

export interface AiUsageWindow {
  label: string;
  usedPercent: number;
  remainingPercent: number;
  resetAt?: string;
  resetAfterSeconds?: number;
  limitWindowSeconds?: number;
}

export interface AiUsageCredits {
  balance?: string;
  hasCredits?: boolean;
  unlimited?: boolean;
}

export interface AiUsageSummary {
  availability: AiUsageAvailability;
  provider?: AiModelProvider;
  model?: string;
  planType?: string;
  primaryWindow?: AiUsageWindow;
  secondaryWindow?: AiUsageWindow;
  credits?: AiUsageCredits;
  observedAt: string;
  message?: string;
}

export function normalizeOpenAiCodexUsage(payload: unknown, observedAt = new Date().toISOString()): AiUsageSummary {
  const root = asRecord(payload);
  const rateLimit = asRecord(root?.rate_limit ?? root?.rateLimit);
  const creditsValue = asRecord(root?.credits);
  const primaryWindow = normalizeWindow(rateLimit?.primary_window ?? rateLimit?.primaryWindow, "5-hour limit");
  const secondaryWindow = normalizeWindow(rateLimit?.secondary_window ?? rateLimit?.secondaryWindow, "Weekly limit");
  const credits = creditsValue ? normalizeCredits(creditsValue) : undefined;

  if (!primaryWindow && !secondaryWindow && !credits) {
    return {
      availability: "UNAVAILABLE",
      observedAt,
      message: "ChatGPT returned an unrecognized usage response. Refresh or check usage in ChatGPT Settings.",
    };
  }

  return {
    availability: "AVAILABLE",
    planType: stringValue(root?.plan_type ?? root?.planType),
    primaryWindow,
    secondaryWindow,
    credits,
    observedAt,
  };
}

function normalizeWindow(value: unknown, label: string): AiUsageWindow | undefined {
  const window = asRecord(value);
  if (!window) return undefined;
  const usedPercent = finiteNumber(window.used_percent ?? window.usedPercent);
  if (usedPercent === undefined) return undefined;
  const boundedUsedPercent = Math.min(100, Math.max(0, usedPercent));
  return {
    label,
    usedPercent: boundedUsedPercent,
    remainingPercent: 100 - boundedUsedPercent,
    resetAt: normalizeTimestamp(window.reset_at ?? window.resetAt),
    resetAfterSeconds: finiteNumber(window.reset_after_seconds ?? window.resetAfterSeconds),
    limitWindowSeconds: finiteNumber(window.limit_window_seconds ?? window.limitWindowSeconds),
  };
}

function normalizeCredits(value: Record<string, unknown>): AiUsageCredits | undefined {
  const balance = value.balance === undefined || value.balance === null ? undefined : String(value.balance);
  const hasCredits = typeof value.has_credits === "boolean" ? value.has_credits : typeof value.hasCredits === "boolean" ? value.hasCredits : undefined;
  const unlimited = typeof value.unlimited === "boolean" ? value.unlimited : undefined;
  if (balance === undefined && hasCredits === undefined && unlimited === undefined) return undefined;
  return { balance, hasCredits, unlimited };
}

function normalizeTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value > 10_000_000_000 ? value : value * 1000);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  if (typeof value !== "string" || !value.trim()) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function finiteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
