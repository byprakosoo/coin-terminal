import { describe, expect, it } from "vitest";
import { classifyLateEntry } from "@/server/late-entry";

describe("classifyLateEntry", () => {
  it.each([
    [{ qualifiedWalletCount: 2, priceChangePct: "9", liquidityUsd: "1000000" }, "EARLY"],
    [{ qualifiedWalletCount: 2, priceChangePct: "22", liquidityUsd: "1000000" }, "CONFIRMED"],
    [{ qualifiedWalletCount: 3, priceChangePct: "41", liquidityUsd: "1000000" }, "EXTENDED"],
    [
      {
        qualifiedWalletCount: 3,
        priceChangePct: "10",
        liquidityUsd: "100000",
        suspiciousPattern: true,
      },
      "AVOID",
    ],
  ] as const)("classifies %j as %s", (input, expected) => {
    expect(classifyLateEntry(input).status).toBe(expected);
  });

  it("gives AVOID precedence over otherwise positive wallet activity", () => {
    const result = classifyLateEntry({
      qualifiedWalletCount: 4,
      priceChangePct: "8",
      liquidityUsd: "5000000",
      sourceFresh: false,
    });
    expect(result.status).toBe("AVOID");
    expect(result.riskFactors[0]).toMatch(/stale|incomplete/i);
  });
});
