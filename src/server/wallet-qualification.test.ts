import { describe, expect, it } from "vitest";
import { qualifyWallet } from "@/server/wallet-qualification";

describe("qualifyWallet", () => {
  it("requires every measurable proxy criterion", () => {
    const result = qualifyWallet({
      closedPositions: 20,
      realizedPerformanceUsd: "125000",
      winRatePct: "55",
      medianHoldingMinutes: 31,
      lastActivityAt: new Date("2026-07-01T00:00:00.000Z"),
      dominantServiceOrWashBehavior: false,
      now: new Date("2026-07-10T00:00:00.000Z"),
    });
    expect(result.classification).toBe("HIGH_PERFORMANCE_PROXY");
  });

  it("does not qualify a wallet with too few reconstructed positions", () => {
    const result = qualifyWallet({
      closedPositions: 19,
      realizedPerformanceUsd: "125000",
      winRatePct: "80",
      medianHoldingMinutes: 120,
      lastActivityAt: new Date("2026-07-09T00:00:00.000Z"),
      now: new Date("2026-07-10T00:00:00.000Z"),
    });
    expect(result.classification).toBe("UNVERIFIED_WHALE");
  });

  it("gives exclusion precedence over self-attestation", () => {
    expect(
      qualifyWallet({
        excludedService: true,
        selfAttested: true,
        closedPositions: 100,
        realizedPerformanceUsd: "1000",
        winRatePct: "90",
        medianHoldingMinutes: 100,
      }).classification,
    ).toBe("EXCLUDED");
  });
});
