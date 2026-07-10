import Decimal from "decimal.js";
import type { WalletClassification } from "@/lib/types";

export interface WalletQualificationInput {
  manuallyTrusted?: boolean;
  publiclyAttributed?: boolean;
  excludedService?: boolean;
  closedPositions: number;
  realizedPerformanceUsd: string;
  winRatePct: string;
  medianHoldingMinutes: number;
  lastActivityAt?: Date;
  dominantServiceOrWashBehavior?: boolean;
  now?: Date;
}

export function qualifyWallet(input: WalletQualificationInput): {
  classification: WalletClassification;
  reasons: string[];
} {
  if (input.excludedService) {
    return { classification: "EXCLUDED", reasons: ["Address is a known service or excluded entity"] };
  }
  if (input.manuallyTrusted) {
    return { classification: "USER_VERIFIED", reasons: ["User manually verified this public address"] };
  }
  if (input.publiclyAttributed) {
    return {
      classification: "PUBLICLY_ATTRIBUTED",
      reasons: ["Address attribution has a manually reviewed public source"],
    };
  }

  const now = input.now ?? new Date();
  const recent = Boolean(
    input.lastActivityAt && now.getTime() - input.lastActivityAt.getTime() <= 30 * 24 * 60 * 60 * 1000,
  );
  const checks = [
    [input.closedPositions >= 20, "At least 20 reconstructed closed positions"],
    [new Decimal(input.realizedPerformanceUsd).gt(0), "Positive realized historical performance"],
    [new Decimal(input.winRatePct).gte(55), "Win rate of at least 55%"],
    [input.medianHoldingMinutes > 30, "Median holding period over 30 minutes"],
    [recent, "Activity within the last 30 days"],
    [!input.dominantServiceOrWashBehavior, "No dominant exchange, transfer, or wash-like behavior"],
  ] as const;
  if (checks.every(([passed]) => passed)) {
    return {
      classification: "HIGH_PERFORMANCE_PROXY",
      reasons: checks.map(([, reason]) => reason),
    };
  }
  return {
    classification: "UNVERIFIED_WHALE",
    reasons: checks.filter(([passed]) => !passed).map(([, reason]) => `Missing: ${reason}`),
  };
}
