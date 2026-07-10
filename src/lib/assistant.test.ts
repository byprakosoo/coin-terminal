import { describe, expect, it } from "vitest";
import { buildAssistantReply } from "@/lib/assistant";
import { createDemoData } from "@/lib/seed";

const seed = createDemoData(new Date("2026-07-10T12:00:00.000Z").getTime());
const context = {
  transactions: seed.transactions,
  spending: seed.spending,
  prices: seed.prices,
  signals: seed.signals,
  events: seed.events,
};

describe("buildAssistantReply", () => {
  it("routes BTC questions to the signal explanation tool", () => {
    const reply = buildAssistantReply("Why is BTC currently WATCH?", context);
    expect(reply.toolName).toBe("getBtcSignalExplanation");
    expect(reply.content).toContain("BTC is currently WATCH");
    expect(reply.sources.length).toBeGreaterThan(0);
    expect(reply.investmentRelated).toBe(true);
  });

  it("routes expense questions to the spending selector", () => {
    const reply = buildAssistantReply("How did my expenses change?", context);
    expect(reply.toolName).toBe("getSpendingSummary");
    expect(reply.content).toContain("expenses");
    expect(reply.investmentRelated).toBe(false);
  });

  it("surfaces incomplete basis in data-quality answers", () => {
    const reply = buildAssistantReply("What data should I fix before trusting P&L?", context);
    expect(reply.toolName).toBe("getDataQualityReport");
    expect(reply.content).toContain("ETH reward");
  });
});
