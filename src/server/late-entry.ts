import Decimal from "decimal.js";
import type { EntryStatus } from "@/lib/types";

export interface LateEntryInput {
  qualifiedWalletCount: number;
  priceChangePct: string;
  liquidityUsd: string;
  volumeTrendPct?: string;
  rsi?: string;
  pairAgeHours?: string;
  concentrationPct?: string;
  sharpReversal?: boolean;
  suspiciousPattern?: boolean;
  sourceFresh?: boolean;
}

export function classifyLateEntry(input: LateEntryInput): {
  status: EntryStatus;
  riskFactors: string[];
} {
  const change = new Decimal(input.priceChangePct);
  const liquidity = new Decimal(input.liquidityUsd);
  const rsi = new Decimal(input.rsi ?? 50);
  const volumeTrend = new Decimal(input.volumeTrendPct ?? 0);
  const pairAge = new Decimal(input.pairAgeHours ?? 999);
  const concentration = new Decimal(input.concentrationPct ?? 0);
  const avoidReasons = [
    liquidity.lt(250_000) && "Liquidity is below the $250K research floor",
    pairAge.lt(24) && "Pair is less than 24 hours old",
    concentration.gt(70) && "Observed flow is highly concentrated",
    input.sharpReversal && "A sharp reversal was detected",
    input.suspiciousPattern && "A suspicious transfer pattern was detected",
    input.sourceFresh === false && "Required source data is stale or incomplete",
  ].filter((value): value is string => Boolean(value));
  if (avoidReasons.length) return { status: "AVOID", riskFactors: avoidReasons };

  const extendedReasons = [
    change.gt(35) && `Price moved ${change.toFixed(2)}% since first detection`,
    rsi.gte(70) && `RSI is elevated at ${rsi.toFixed(2)}`,
    volumeTrend.lt(-20) && "Observed buy volume is declining",
  ].filter((value): value is string => Boolean(value));
  if (extendedReasons.length) return { status: "EXTENDED", riskFactors: extendedReasons };

  if (input.qualifiedWalletCount >= 2 && change.gte(15)) {
    return {
      status: "CONFIRMED",
      riskFactors: ["Multiple qualified wallets are buying, but price has entered confirmation range"],
    };
  }
  return {
    status: "EARLY",
    riskFactors: ["Observed qualified buying remains below the 15% extension threshold"],
  };
}
