import Decimal from "decimal.js";

export const btcResearchRuleVersion = "btc-consensus-research-v2.1.0";

export const btcResearchRuleConfig = {
  instrument: "BTC/USD",
  cadence: "1D_COMPLETED_UTC",
  marketSources: ["Coinbase", "Binance"],
  minimumCompletedCloses: 51,
  consensusMaxDeviationPct: "1.5",
  maximumDataAgeHours: 24,
  buyThreshold: "70",
  sellThreshold: "30",
  volatilityKillThreshold: "95",
  weights: {
    momentum: "25",
    trend: "25",
    meanReversion: "20",
    volatility: "15",
    institutionalPositioning: "10",
    wallets: "5",
  },
  institutionalPositioning: {
    source: "CFTC Traders in Financial Futures — CME Bitcoin futures only",
    contractMarketCode: "133741",
    contractMultiplierBtc: "5",
    maximumReportAgeDays: 14,
    neutralScore: "50",
    minimumScore: "10",
    maximumScore: "90",
    maximumPositionAdjustment: "30",
    maximumWeeklyChangeAdjustment: "10",
    weeklyChangeScale: "500",
  },
  walletContext: {
    windowHours: 168,
    neutralScore: "50",
    minimumScore: "10",
    maximumScore: "90",
    maximumDirectionalAdjustment: "40",
    qualifiedClassifications: [
      "USER_VERIFIED",
      "PUBLICLY_ATTRIBUTED",
      "HIGH_PERFORMANCE_PROXY",
    ],
  },
  execution: "RESEARCH_ONLY_NO_ORDER_OR_ALLOCATION",
} as const;

export interface BtcWalletMovement {
  walletId: string;
  direction: "TRANSFER_IN" | "TRANSFER_OUT";
  quantityBtc: string;
}

export interface BtcWalletContext {
  score: string;
  inflowBtc: string;
  outflowBtc: string;
  netBtc: string;
  movementCount: number;
  activeWalletCount: number;
  hasObservations: boolean;
}

export interface CftcBtcPositioningInput {
  reportDate: string;
  openInterestContracts: string;
  assetManagerLongContracts: string;
  assetManagerShortContracts: string;
  assetManagerSpreadContracts: string;
  changeAssetManagerLongContracts: string;
  changeAssetManagerShortContracts: string;
  assetManagerLongTraders?: number;
  assetManagerShortTraders?: number;
}

export interface CftcBtcInstitutionalContext {
  score: string;
  rawScore: string;
  reportDate: string;
  reportAgeDays: number;
  stale: boolean;
  available: boolean;
  openInterestContracts: string;
  longContracts: string;
  shortContracts: string;
  spreadContracts: string;
  netContracts: string;
  weeklyNetChangeContracts: string;
  longSharePct: string;
  shortSharePct: string;
  netBtcEquivalent: string;
  assetManagerLongTraders?: number;
  assetManagerShortTraders?: number;
}

export function deriveBtcWalletContext(movements: BtcWalletMovement[]): BtcWalletContext {
  let inflow = new Decimal(0);
  let outflow = new Decimal(0);
  let movementCount = 0;
  const activeWallets = new Set<string>();

  for (const movement of movements) {
    const quantity = safePositiveDecimal(movement.quantityBtc);
    if (!quantity) continue;
    movementCount += 1;
    activeWallets.add(movement.walletId);
    if (movement.direction === "TRANSFER_IN") inflow = inflow.add(quantity);
    else outflow = outflow.add(quantity);
  }

  const total = inflow.add(outflow);
  const net = inflow.sub(outflow);
  const neutral = new Decimal(btcResearchRuleConfig.walletContext.neutralScore);
  const score = total.isZero()
    ? neutral
    : Decimal.max(
        btcResearchRuleConfig.walletContext.minimumScore,
        Decimal.min(
          btcResearchRuleConfig.walletContext.maximumScore,
          neutral.add(
            net
              .div(total)
              .mul(btcResearchRuleConfig.walletContext.maximumDirectionalAdjustment),
          ),
        ),
      );

  return {
    score: score.toFixed(2),
    inflowBtc: normalizedQuantity(inflow),
    outflowBtc: normalizedQuantity(outflow),
    netBtc: normalizedQuantity(net),
    movementCount,
    activeWalletCount: activeWallets.size,
    hasObservations: movementCount > 0,
  };
}

export function deriveCftcBtcInstitutionalContext(
  input: CftcBtcPositioningInput,
  now = new Date(),
): CftcBtcInstitutionalContext {
  const neutral = new Decimal(btcResearchRuleConfig.institutionalPositioning.neutralScore);
  const reportAt = Date.parse(`${input.reportDate}T23:59:59.999Z`);
  const reportAgeDays = Number.isFinite(reportAt)
    ? Math.max(0, Math.floor((now.getTime() - reportAt) / 86_400_000))
    : Number.MAX_SAFE_INTEGER;
  const values = safeCftcValues(input);
  const stale =
    reportAgeDays > btcResearchRuleConfig.institutionalPositioning.maximumReportAgeDays;

  if (!values) {
    return {
      score: neutral.toFixed(2),
      rawScore: neutral.toFixed(2),
      reportDate: input.reportDate,
      reportAgeDays,
      stale: true,
      available: false,
      openInterestContracts: "0",
      longContracts: "0",
      shortContracts: "0",
      spreadContracts: "0",
      netContracts: "0",
      weeklyNetChangeContracts: "0",
      longSharePct: "0.00",
      shortSharePct: "0.00",
      netBtcEquivalent: "0",
      assetManagerLongTraders: input.assetManagerLongTraders,
      assetManagerShortTraders: input.assetManagerShortTraders,
    };
  }

  const directional = values.long.add(values.short);
  const net = values.long.sub(values.short);
  const weeklyNetChange = values.changeLong.sub(values.changeShort);
  const netRatio = directional.gt(0) ? net.div(directional) : new Decimal(0);
  const positionAdjustment = netRatio.mul(
    btcResearchRuleConfig.institutionalPositioning.maximumPositionAdjustment,
  );
  const weeklyAdjustment = clampSigned(
    weeklyNetChange
      .div(values.openInterest)
      .mul(btcResearchRuleConfig.institutionalPositioning.weeklyChangeScale),
    new Decimal(
      btcResearchRuleConfig.institutionalPositioning.maximumWeeklyChangeAdjustment,
    ),
  );
  const rawScore = clampRange(
    neutral.add(positionAdjustment).add(weeklyAdjustment),
    new Decimal(btcResearchRuleConfig.institutionalPositioning.minimumScore),
    new Decimal(btcResearchRuleConfig.institutionalPositioning.maximumScore),
  );

  return {
    score: stale ? neutral.toFixed(2) : rawScore.toFixed(2),
    rawScore: rawScore.toFixed(2),
    reportDate: input.reportDate,
    reportAgeDays,
    stale,
    available: !stale,
    openInterestContracts: values.openInterest.toString(),
    longContracts: values.long.toString(),
    shortContracts: values.short.toString(),
    spreadContracts: values.spread.toString(),
    netContracts: net.toString(),
    weeklyNetChangeContracts: weeklyNetChange.toString(),
    longSharePct: values.long.div(values.openInterest).mul(100).toFixed(2),
    shortSharePct: values.short.div(values.openInterest).mul(100).toFixed(2),
    netBtcEquivalent: net
      .mul(btcResearchRuleConfig.institutionalPositioning.contractMultiplierBtc)
      .toString(),
    assetManagerLongTraders: input.assetManagerLongTraders,
    assetManagerShortTraders: input.assetManagerShortTraders,
  };
}

function safePositiveDecimal(value: string) {
  try {
    const parsed = new Decimal(value);
    return parsed.isFinite() && parsed.gt(0) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function normalizedQuantity(value: Decimal) {
  return value.toDecimalPlaces(8).toString();
}

function safeCftcValues(input: CftcBtcPositioningInput) {
  try {
    const openInterest = new Decimal(input.openInterestContracts);
    const long = new Decimal(input.assetManagerLongContracts);
    const short = new Decimal(input.assetManagerShortContracts);
    const spread = new Decimal(input.assetManagerSpreadContracts);
    const changeLong = new Decimal(input.changeAssetManagerLongContracts);
    const changeShort = new Decimal(input.changeAssetManagerShortContracts);
    if (
      !openInterest.isFinite() ||
      !long.isFinite() ||
      !short.isFinite() ||
      !spread.isFinite() ||
      !changeLong.isFinite() ||
      !changeShort.isFinite() ||
      !openInterest.gt(0) ||
      long.lt(0) ||
      short.lt(0) ||
      spread.lt(0)
    ) {
      return undefined;
    }
    return { openInterest, long, short, spread, changeLong, changeShort };
  } catch {
    return undefined;
  }
}

function clampSigned(value: Decimal, maximum: Decimal) {
  return Decimal.max(maximum.neg(), Decimal.min(maximum, value));
}

function clampRange(value: Decimal, minimum: Decimal, maximum: Decimal) {
  return Decimal.max(minimum, Decimal.min(maximum, value));
}
