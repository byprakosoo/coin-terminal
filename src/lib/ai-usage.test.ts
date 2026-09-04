import { describe, expect, it } from "vitest";
import { normalizeOpenAiCodexUsage } from "@/lib/ai-usage";

describe("normalizeOpenAiCodexUsage", () => {
  it("normalizes ChatGPT five-hour and weekly windows", () => {
    const result = normalizeOpenAiCodexUsage({
      plan_type: "plus",
      rate_limit: {
        primary_window: { used_percent: 7, reset_at: 1_782_000_000, reset_after_seconds: 9_240, limit_window_seconds: 18_000 },
        secondary_window: { used_percent: 2, reset_at: "2026-09-01T00:00:00.000Z", reset_after_seconds: 600, limit_window_seconds: 604_800 },
      },
      credits: { balance: "0", has_credits: false, unlimited: false },
    }, "2026-08-28T00:00:00.000Z");

    expect(result.availability).toBe("AVAILABLE");
    expect(result.planType).toBe("plus");
    expect(result.primaryWindow?.remainingPercent).toBe(93);
    expect(result.secondaryWindow?.remainingPercent).toBe(98);
    expect(result.primaryWindow?.resetAt).toBe(new Date(1_782_000_000 * 1000).toISOString());
    expect(result.credits).toEqual({ balance: "0", hasCredits: false, unlimited: false });
  });

  it("fails closed when the upstream payload has no usage fields", () => {
    expect(normalizeOpenAiCodexUsage({ detail: "Unauthorized" }, "2026-08-28T00:00:00.000Z")).toEqual({
      availability: "UNAVAILABLE",
      observedAt: "2026-08-28T00:00:00.000Z",
      message: "ChatGPT returned an unrecognized usage response. Refresh or check usage in ChatGPT Settings.",
    });
  });
});
