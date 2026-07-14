import "server-only";
import Decimal from "decimal.js";
import { and, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  btcStrategyProfiles,
  dataSources,
  marketCandles,
  signalAcknowledgements,
  signalEvidence,
  signalRuleVersions,
  signals,
  strategyValidationRuns,
  users,
  walletEvents,
  watchlistWallets,
} from "@/db/schema";
import {
  defensiveRuleConfig,
  defensiveRuleVersion,
  evaluateDefensiveSignal,
} from "@/lib/btc-defensive-strategy";
import { validateDefensiveHistory, type DefensiveBacktestResult } from "@/lib/btc-defensive-backtest";
import {
  initialProfileLifecycle,
  validationLifecycleTransition,
} from "@/lib/btc-strategy-lifecycle";
import {
  btcResearchRuleConfig,
  btcResearchRuleVersion,
  deriveBtcWalletContext,
  deriveCftcBtcInstitutionalContext,
  type CftcBtcPositioningInput,
} from "@/lib/btc-research-rule";
import type { BtcStrategyProfile, SignalAcknowledgement, StrategyValidationSummary } from "@/lib/types";
import { providerIds } from "@/server/constants";
import { createId, payloadHash, stableId } from "@/server/ids";
import {
  buildConsensusCandles,
  consensusDeviationPct,
  fetchBtcHistoryDatasets,
  type BtcHistoryDataset,
} from "@/server/providers/btc-history";
import {
  cftcTffApiUrl,
  cftcTffDatasetUrl,
  fetchCftcBtcInstitutionalPositioning,
} from "@/server/providers/cftc";
import { generateBtcSignal } from "@/server/signal-engine";

const strategyRuleId = stableId("signal-rule", defensiveRuleVersion);
const researchRuleId = stableId("signal-rule", btcResearchRuleVersion);
const shadowGateDays = 180;
const qualifiedWalletClassifications = [
  "USER_VERIFIED",
  "PUBLICLY_ATTRIBUTED",
  "HIGH_PERFORMANCE_PROXY",
] as const;

export async function ensureDefensiveRule() {
  const ruleHash = payloadHash(defensiveRuleConfig);
  await db
    .insert(signalRuleVersions)
    .values({
      id: strategyRuleId,
      version: defensiveRuleVersion,
      configuration: defensiveRuleConfig as unknown as Record<string, unknown>,
      active: false,
      lifecycleStatus: "CANDIDATE",
      ruleHash,
    })
    .onDuplicateKeyUpdate({
      set: { id: sql`${signalRuleVersions.id}` },
    });
  const [row] = await db
    .select()
    .from(signalRuleVersions)
    .where(eq(signalRuleVersions.id, strategyRuleId))
    .limit(1);
  if (!row) throw new Error("The defensive BTC rule could not be initialized.");
  if (row.ruleHash && row.ruleHash !== ruleHash) {
    throw new Error(
      `Frozen rule ${defensiveRuleVersion} no longer matches its persisted hash. Bump the rule version before validating changed configuration.`,
    );
  }
  if (!row.ruleHash) {
    await db
      .update(signalRuleVersions)
      .set({
        configuration: defensiveRuleConfig as unknown as Record<string, unknown>,
        ruleHash,
      })
      .where(eq(signalRuleVersions.id, strategyRuleId));
  }
  return {
    id: strategyRuleId,
    ruleHash,
    lifecycleStatus: row.lifecycleStatus,
    active: row.active,
    validatedAt: row.validatedAt,
  };
}

export async function ensureBtcResearchRule() {
  const ruleHash = payloadHash(btcResearchRuleConfig);
  await db
    .insert(signalRuleVersions)
    .values({
      id: researchRuleId,
      version: btcResearchRuleVersion,
      configuration: btcResearchRuleConfig as unknown as Record<string, unknown>,
      active: false,
      lifecycleStatus: "CANDIDATE",
      ruleHash,
    })
    .onDuplicateKeyUpdate({ set: { id: sql`${signalRuleVersions.id}` } });
  const [row] = await db
    .select()
    .from(signalRuleVersions)
    .where(eq(signalRuleVersions.id, researchRuleId))
    .limit(1);
  if (!row) throw new Error("The BTC consensus research rule could not be initialized.");
  if (row.ruleHash && row.ruleHash !== ruleHash) {
    throw new Error(
      `Frozen rule ${btcResearchRuleVersion} no longer matches its persisted hash. Bump the rule version before changing its configuration.`,
    );
  }
  if (!row.ruleHash) {
    await db
      .update(signalRuleVersions)
      .set({
        configuration: btcResearchRuleConfig as unknown as Record<string, unknown>,
        ruleHash,
      })
      .where(eq(signalRuleVersions.id, researchRuleId));
  }
  return { id: researchRuleId, ruleHash };
}

export async function getBtcStrategyProfile(userId: string): Promise<BtcStrategyProfile> {
  const rule = await ensureDefensiveRule();
  const initial = initialProfileState(rule.lifecycleStatus, rule.validatedAt);
  await db
    .insert(btcStrategyProfiles)
    .values({
      userId,
      activeRuleVersionId: rule.id,
      lifecycleStatus: initial.lifecycleStatus,
      shadowStartedAt: initial.shadowStartedAt,
    })
    .onDuplicateKeyUpdate({ set: { userId: sql`${btcStrategyProfiles.userId}` } });

  let [profile] = await db
    .select()
    .from(btcStrategyProfiles)
    .where(eq(btcStrategyProfiles.userId, userId))
    .limit(1);
  if (!profile) throw new Error("The BTC strategy profile could not be initialized.");
  if (profile.activeRuleVersionId !== rule.id) {
    await db
      .update(btcStrategyProfiles)
      .set({
        activeRuleVersionId: rule.id,
        lifecycleStatus: initial.lifecycleStatus,
        shadowStartedAt: initial.shadowStartedAt,
        modelAllocationPct: "0",
        lastModelChangeAt: null,
        recoveringFromHardExit: false,
      })
      .where(eq(btcStrategyProfiles.userId, userId));
    [profile] = await db
      .select()
      .from(btcStrategyProfiles)
      .where(eq(btcStrategyProfiles.userId, userId))
      .limit(1);
  }
  const [validation] = await db
    .select()
    .from(strategyValidationRuns)
    .where(eq(strategyValidationRuns.ruleVersionId, rule.id))
    .orderBy(desc(strategyValidationRuns.startedAt))
    .limit(1);
  const [latestSignal] = await db
    .select({ priceUsd: signals.priceUsd })
    .from(signals)
    .where(and(eq(signals.userId, userId), eq(signals.ruleVersionId, rule.id)))
    .orderBy(desc(signals.evaluatedAt))
    .limit(1);
  const [shadowSignalCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(signals)
    .where(
      and(
        eq(signals.userId, userId),
        eq(signals.ruleVersionId, rule.id),
        eq(signals.mode, "SHADOW"),
        eq(signals.availability, "READY"),
      ),
    );
  const marketValue = new Decimal(profile.btcQuantity).mul(latestSignal?.priceUsd ?? 0);
  const confirmedEquity = new Decimal(profile.cashBalanceUsd).add(marketValue);

  return {
    lifecycleStatus: profile.lifecycleStatus,
    ruleVersion: defensiveRuleVersion,
    ruleHash: rule.ruleHash,
    sleeveBudgetUsd: profile.sleeveBudgetUsd ?? undefined,
    cashBalanceUsd: profile.cashBalanceUsd,
    btcQuantity: profile.btcQuantity,
    modelAllocationPct: profile.modelAllocationPct,
    confirmedAllocationPct: confirmedEquity.gt(0)
      ? marketValue.div(confirmedEquity).mul(100).toFixed(2)
      : "0.00",
    shadowStartedAt: profile.shadowStartedAt?.toISOString(),
    shadowDays: profile.shadowStartedAt
      ? Math.max(0, Math.floor((Date.now() - profile.shadowStartedAt.getTime()) / 86_400_000))
      : 0,
    shadowSignals: Number(shadowSignalCount?.count ?? 0),
    lastModelChangeAt: profile.lastModelChangeAt?.toISOString(),
    recoveringFromHardExit: profile.recoveringFromHardExit,
    latestValidation: validation ? mapValidation(validation) : undefined,
  };
}

export async function updateBtcStrategyBudget(userId: string, sleeveBudgetUsd: string) {
  const profile = await getBtcStrategyProfile(userId);
  const budget = new Decimal(sleeveBudgetUsd);
  if (!budget.gt(0)) throw new Error("The strategy sleeve budget must be positive.");
  const previousBudget = new Decimal(profile.sleeveBudgetUsd ?? 0);
  const adjustedCash = new Decimal(profile.cashBalanceUsd).add(budget.sub(previousBudget));
  if (adjustedCash.lt(0)) throw new Error("The new budget is below capital already assigned to the strategy sleeve.");
  await db
    .update(btcStrategyProfiles)
    .set({ sleeveBudgetUsd: budget.toString(), cashBalanceUsd: adjustedCash.toString() })
    .where(eq(btcStrategyProfiles.userId, userId));
  return getBtcStrategyProfile(userId);
}

export async function runDefensiveHistoricalValidation() {
  const rule = await ensureDefensiveRule();
  const runId = createId();
  await db.insert(strategyValidationRuns).values({
    id: runId,
    ruleVersionId: rule.id,
    status: "RUNNING",
    ruleHash: rule.ruleHash,
    metrics: {},
    failureReasons: [],
  });

  try {
    const datasets = await fetchBtcHistoryDatasets(true);
    await persistDatasets(datasets);
    const result = validateDefensiveHistory(datasets);
    const allCandles = datasets.flatMap((dataset) => dataset.candles);
    const startedOn = datasets.map((item) => item.candles[0]?.date).sort()[0];
    const endedOn = datasets.map((item) => item.candles.at(-1)?.date).filter(Boolean).sort().at(-1);
    const metrics = summarizeValidation(result.sourceResults, result.stressResults);
    const completedAt = new Date();
    const transition = validationLifecycleTransition(rule.lifecycleStatus, result.passed);
    const nextLifecycle = transition.lifecycleStatus;
    await db.transaction(async (tx) => {
      await tx
        .update(strategyValidationRuns)
        .set({
          status: result.passed ? "PASSED" : "FAILED",
          datasetStartedOn: startedOn,
          datasetEndedOn: endedOn,
          dataHash: payloadHash(allCandles),
          metrics,
          failureReasons: result.failureReasons,
          completedAt,
        })
        .where(eq(strategyValidationRuns.id, runId));
      await tx
        .update(signalRuleVersions)
        .set({
          lifecycleStatus: nextLifecycle,
          active: result.passed,
          validatedAt: result.passed ? rule.validatedAt ?? completedAt : rule.validatedAt,
        })
        .where(eq(signalRuleVersions.id, rule.id));
      if (result.passed) {
        await tx
          .update(signalRuleVersions)
          .set({ active: false, lifecycleStatus: "RETIRED" })
          .where(and(sql`${signalRuleVersions.id} <> ${rule.id}`, eq(signalRuleVersions.active, true)));
        if (transition.restartShadow) {
          await tx
            .update(btcStrategyProfiles)
            .set({
              activeRuleVersionId: rule.id,
              lifecycleStatus: "SHADOW",
              shadowStartedAt: completedAt,
              modelAllocationPct: "0",
              lastModelChangeAt: null,
              recoveringFromHardExit: false,
            });
        }
      } else if (nextLifecycle === "DEGRADED") {
        await tx
          .update(btcStrategyProfiles)
          .set({ lifecycleStatus: "DEGRADED" })
          .where(eq(btcStrategyProfiles.activeRuleVersionId, rule.id));
      } else {
        await tx
          .update(btcStrategyProfiles)
          .set({
            activeRuleVersionId: rule.id,
            lifecycleStatus: "REJECTED",
            shadowStartedAt: null,
            modelAllocationPct: "0",
            lastModelChangeAt: null,
            recoveringFromHardExit: false,
          })
          .where(eq(btcStrategyProfiles.activeRuleVersionId, rule.id));
      }
    });
    return {
      runId,
      status: result.passed ? "PASSED" : "FAILED",
      lifecycle: nextLifecycle,
      failureReasons: result.failureReasons,
      datasets: datasets.map((item) => ({ source: item.source, candles: item.candles.length })),
      metrics,
    };
  } catch (error) {
    await db
      .update(strategyValidationRuns)
      .set({
        status: "FAILED",
        failureReasons: [error instanceof Error ? error.message : "Historical validation failed."],
        completedAt: new Date(),
      })
      .where(eq(strategyValidationRuns.id, runId));
    throw error;
  }
}

export async function generateBtcDailySignals() {
  const researchRule = await ensureBtcResearchRule();
  const defensiveRuleResult = await ensureDefensiveRule()
    .then((rule) => ({ rule, error: undefined }))
    .catch((error: unknown) => ({
      rule: undefined,
      error: error instanceof Error ? error.message : "The defensive rule could not be initialized.",
    }));
  const [datasets, cftcResult] = await Promise.all([
    fetchBtcHistoryDatasets(false),
    fetchCftcBtcInstitutionalPositioning()
      .then((positioning) => ({ positioning, error: undefined }))
      .catch((error: unknown) => ({
        positioning: undefined,
        error: error instanceof Error ? error.message : "CFTC positioning is unavailable.",
      })),
  ]);
  await persistDatasets(datasets);
  await db
    .insert(dataSources)
    .values({
      id: providerIds.cftc,
      provider: "CFTC TFF Bitcoin",
      sourceUrl: cftcTffDatasetUrl,
      enabled: true,
    })
    .onDuplicateKeyUpdate({ set: { enabled: true } });
  const consensus = buildConsensusCandles(datasets);
  if (consensus.length < btcResearchRuleConfig.minimumCompletedCloses) {
    throw new Error("The public sources did not provide enough shared completed candles.");
  }
  const latest = consensus.at(-1)!;
  const previous = consensus.at(-2)!;
  const deviation = consensusDeviationPct(datasets, latest.date);
  const sourceAvailable =
    deviation !== undefined &&
    deviation.lte(btcResearchRuleConfig.consensusMaxDeviationPct);
  const price = new Decimal(latest.close);
  const change24h = price.div(previous.close).sub(1).mul(100);
  const evaluatedAt = new Date(`${latest.date}T23:59:59.999Z`);
  const consensusHash = payloadHash(consensus);
  const userRows = await db.select({ id: users.id }).from(users);
  const research = await generateResearchSignals({
    researchRule,
    datasets,
    consensus,
    consensusHash,
    deviation,
    sourceAvailable,
    price,
    change24h,
    evaluatedAt,
    userRows,
    institutionalPositioning: cftcResult.positioning,
    institutionalError: cftcResult.error,
  });

  if (!defensiveRuleResult.rule) {
    await expireOldSignals();
    return {
      skipped: false,
      date: latest.date,
      priceUsd: price.toString(),
      sourceDeviationPct: deviation?.toFixed(4),
      available: sourceAvailable,
      signalsGenerated: research.signalsGenerated,
      signalsAlreadyPresent: research.signalsAlreadyPresent,
      research,
      defensive: {
        skipped: true,
        reason: defensiveRuleResult.error,
        lifecycle: "CANDIDATE",
      },
    };
  }
  const rule = defensiveRuleResult.rule;

  const [ruleRow] = await db
    .select()
    .from(signalRuleVersions)
    .where(eq(signalRuleVersions.id, rule.id))
    .limit(1);
  if (!ruleRow || !["SHADOW", "VALIDATED", "DEGRADED"].includes(ruleRow.lifecycleStatus)) {
    await expireOldSignals();
    return {
      skipped: false,
      date: latest.date,
      priceUsd: price.toString(),
      sourceDeviationPct: deviation?.toFixed(4),
      available: sourceAvailable,
      signalsGenerated: research.signalsGenerated,
      signalsAlreadyPresent: research.signalsAlreadyPresent,
      research,
      defensive: {
        skipped: true,
        reason: "Historical validation has not passed.",
        lifecycle: ruleRow?.lifecycleStatus ?? "CANDIDATE",
      },
    };
  }
  if (consensus.length < defensiveRuleConfig.smaLongDays + 1) {
    await expireOldSignals();
    return {
      skipped: false,
      date: latest.date,
      priceUsd: price.toString(),
      sourceDeviationPct: deviation?.toFixed(4),
      available: sourceAvailable,
      signalsGenerated: research.signalsGenerated,
      signalsAlreadyPresent: research.signalsAlreadyPresent,
      research,
      defensive: {
        skipped: true,
        reason: "The public sources did not provide enough shared candles for the defensive model.",
        lifecycle: ruleRow.lifecycleStatus,
      },
    };
  }
  let generated = 0;
  let existing = 0;

  for (const user of userRows) {
    const [existingSignal] = await db
      .select({ id: signals.id })
      .from(signals)
      .where(
        and(
          eq(signals.userId, user.id),
          eq(signals.instrument, "BTC/USD"),
          eq(signals.ruleVersionId, rule.id),
          eq(signals.evaluatedAt, evaluatedAt),
        ),
      )
      .limit(1);
    if (existingSignal) {
      existing += 1;
      continue;
    }
    const profile = await getBtcStrategyProfile(user.id);
    if (["CANDIDATE", "REJECTED", "PAUSED"].includes(profile.lifecycleStatus)) continue;
    const decision = evaluateDefensiveSignal(consensus, {
      modelAllocationPct: profile.modelAllocationPct,
      lastModelChangeDate: profile.lastModelChangeAt?.slice(0, 10),
      recoveringFromHardExit: profile.recoveringFromHardExit,
    });
    const effectiveTarget = sourceAvailable ? decision.targetAllocationPct : profile.modelAllocationPct;
    const effectiveDelta = sourceAvailable ? decision.deltaAllocationPct : "0.00";
    const effectiveAction = sourceAvailable ? decision.action : "WATCH";
    const validated = profile.lifecycleStatus === "VALIDATED";
    const recommendedUsd = validated && sourceAvailable && profile.sleeveBudgetUsd
      ? new Decimal(profile.sleeveBudgetUsd).mul(new Decimal(effectiveDelta).abs()).div(100)
      : new Decimal(0);
    const inputHash = payloadHash({
      consensusHash,
      ruleHash: rule.ruleHash,
      sourceDeviationPct: deviation?.toString() ?? null,
      sourceAvailable,
      modelAllocationPct: profile.modelAllocationPct,
      lastModelChangeAt: profile.lastModelChangeAt ?? null,
      recoveringFromHardExit: profile.recoveringFromHardExit,
      sleeveBudgetUsd: profile.sleeveBudgetUsd ?? null,
    });
    const signalId = stableId(user.id, `${defensiveRuleVersion}:${latest.date}`);

    await db.transaction(async (tx) => {
      await tx
        .insert(signals)
        .values({
          id: signalId,
          userId: user.id,
          ruleVersionId: rule.id,
          instrument: "BTC/USD",
          action: effectiveAction,
          compositeScore: decision.agreementPct,
          confidence: decision.agreementPct,
          freshnessStatus: sourceAvailable ? "FRESH" : "MISSING",
          summary: sourceAvailable
            ? decision.summary
            : `Signal halted: the two public sources were missing or differed by more than ${defensiveRuleConfig.consensusMaxDeviationPct}%.`,
          priceUsd: price.toString(),
          change24hPct: change24h.toString(),
          mode: validated ? "VALIDATED" : "SHADOW",
          availability: sourceAvailable ? "READY" : "HALTED",
          agreementPct: decision.agreementPct,
          targetAllocationPct: effectiveTarget,
          deltaAllocationPct: effectiveDelta,
          recommendedUsd: recommendedUsd.toString(),
          recommendedBtc: recommendedUsd.div(price).toString(),
          hardExit: sourceAvailable && decision.hardExit,
          inputHash,
          evaluatedAt,
          expiresAt: new Date(evaluatedAt.getTime() + 24 * 60 * 60 * 1000),
        })
        .onDuplicateKeyUpdate({ set: { id: sql`${signals.id}` } });
      await tx.delete(signalEvidence).where(eq(signalEvidence.signalId, signalId));
      await tx.insert(signalEvidence).values(
        decision.evidence.map((evidence, index) => ({
          id: stableId(signalId, `defensive-evidence:${index}:${evidence.key}`),
          signalId,
          marketSnapshotId: null,
          groupName: evidence.label,
          ruleName: evidence.threshold,
          weightPct: "20",
          score: evidence.passed ? "100" : "0",
          value: evidence.value,
          interpretation: evidence.interpretation,
          sourceLabel: "Coinbase + Binance completed UTC daily candles",
          sourceUrl: "https://exchange.coinbase.com/trade/BTC-USD",
          observedAt: evaluatedAt,
          evidenceKind: "CALCULATED" as const,
          details: {
            key: evidence.key,
            sourceDeviationPct: deviation?.toString() ?? null,
            sourceLinks: datasets.map((dataset) => ({
              label: `${dataset.source} BTC daily candles`,
              url: dataset.sourceUrl,
            })),
          },
        })),
      );
      if (sourceAvailable) {
        await tx
          .update(btcStrategyProfiles)
          .set({
            modelAllocationPct: decision.targetAllocationPct,
            lastModelChangeAt: new Decimal(decision.deltaAllocationPct).isZero()
              ? profile.lastModelChangeAt
                ? new Date(profile.lastModelChangeAt)
                : null
              : evaluatedAt,
            recoveringFromHardExit: decision.recoveringFromHardExit,
          })
          .where(eq(btcStrategyProfiles.userId, user.id));
      }
    });
    generated += 1;
  }

  await promoteEligibleShadowProfiles(rule.id);
  await expireOldSignals();
  return {
    skipped: false,
    date: latest.date,
    priceUsd: price.toString(),
    sourceDeviationPct: deviation?.toFixed(4),
    available: sourceAvailable,
    signalsGenerated: research.signalsGenerated + generated,
    signalsAlreadyPresent: research.signalsAlreadyPresent + existing,
    research,
    defensive: {
      skipped: false,
      lifecycle: ruleRow.lifecycleStatus,
      signalsGenerated: generated,
      signalsAlreadyPresent: existing,
    },
  };
}

export const generateDefensiveDailySignals = generateBtcDailySignals;

interface ResearchSignalContext {
  researchRule: Awaited<ReturnType<typeof ensureBtcResearchRule>>;
  datasets: BtcHistoryDataset[];
  consensus: ReturnType<typeof buildConsensusCandles>;
  consensusHash: string;
  deviation: Decimal | undefined;
  sourceAvailable: boolean;
  price: Decimal;
  change24h: Decimal;
  evaluatedAt: Date;
  userRows: Array<{ id: string }>;
  institutionalPositioning?: CftcBtcPositioningInput;
  institutionalError?: string;
}

async function generateResearchSignals(context: ResearchSignalContext) {
  const sourceLinks = context.datasets.map((dataset) => ({
    label: `${dataset.source} BTC daily candles`,
    url: dataset.sourceUrl,
  }));
  const closes = context.consensus.map((candle) => ({
    date: candle.date,
    close: candle.close,
    observedAt: new Date(`${candle.date}T23:59:59.999Z`),
  }));
  const sourceAgreementPct = context.deviation
    ? Decimal.max(0, new Decimal(100).sub(context.deviation)).toFixed(2)
    : "0.00";
  let generatedCount = 0;
  let existingCount = 0;
  const institutional = context.institutionalPositioning
    ? deriveCftcBtcInstitutionalContext(
        context.institutionalPositioning,
        context.evaluatedAt,
      )
    : undefined;
  const institutionalAvailable = institutional?.available ?? false;
  const institutionalValue = institutional
    ? `${institutional.longContracts} long / ${institutional.shortContracts} short asset-manager contracts; ${signedQuantity(institutional.weeklyNetChangeContracts)} weekly net change`
    : "Official CFTC CME Bitcoin asset-manager positioning is unavailable; factor held neutral";
  const institutionalInterpretation = !institutional
    ? "The official weekly CFTC row was unavailable, so the institutional factor remains neutral and confidence is reduced."
    : institutional.stale
      ? `The CFTC report is ${institutional.reportAgeDays} days old, beyond the configured limit, so the institutional factor remains neutral.`
      : "CFTC Asset Manager/Institutional futures net positioning and its weekly change are scored as a bounded proxy. Futures positions can be hedges and do not prove spot-market intent or superior performance.";
  const institutionalObservedAt = institutional
    ? new Date(`${institutional.reportDate}T23:59:59.999Z`)
    : context.evaluatedAt;

  for (const user of context.userRows) {
    const [existingSignal] = await db
      .select({ id: signals.id })
      .from(signals)
      .where(
        and(
          eq(signals.userId, user.id),
          eq(signals.instrument, "BTC/USD"),
          eq(signals.ruleVersionId, context.researchRule.id),
          eq(signals.evaluatedAt, context.evaluatedAt),
        ),
      )
      .limit(1);
    if (existingSignal) {
      existingCount += 1;
      continue;
    }

    const walletContext = await getBtcWalletContext(user.id, context.evaluatedAt);
    const walletValue = walletContext.hasObservations
      ? `${signedQuantity(walletContext.netBtc)} BTC net (${walletContext.inflowBtc} in / ${walletContext.outflowBtc} out)`
      : "No qualified BTC wallet transfers observed in the 7-day window";
    const generated = generateBtcSignal(closes, {
      now: new Date(),
      volatilityKillThreshold: btcResearchRuleConfig.volatilityKillThreshold,
      marketSource: {
        label: "Coinbase + Binance completed UTC daily-candle consensus",
        sourceUrl: sourceLinks[0].url,
        sourceLinks,
        available: context.sourceAvailable,
        deviationPct: context.deviation?.toString(),
      },
      institutionalContext: {
        score: institutional?.score ?? btcResearchRuleConfig.institutionalPositioning.neutralScore,
        value: institutionalValue,
        interpretation: institutionalInterpretation,
        source: "CFTC Traders in Financial Futures — CME Bitcoin futures only",
        sourceUrl: cftcTffDatasetUrl,
        sourceLinks: [
          { label: "CFTC TFF Futures Only dataset", url: cftcTffDatasetUrl },
          { label: "CFTC current financial-futures report", url: "https://www.cftc.gov/dea/futures/financial_lf.htm" },
        ],
        observedAt: institutionalObservedAt,
        kind: !institutional ? "UNVERIFIED" : institutional.stale ? "STALE" : "CALCULATED",
        available: institutionalAvailable,
        details: institutional
          ? {
              reportDate: institutional.reportDate,
              reportAgeDays: institutional.reportAgeDays,
              openInterestContracts: institutional.openInterestContracts,
              assetManagerLongContracts: institutional.longContracts,
              assetManagerShortContracts: institutional.shortContracts,
              assetManagerSpreadContracts: institutional.spreadContracts,
              assetManagerNetContracts: institutional.netContracts,
              weeklyNetChangeContracts: institutional.weeklyNetChangeContracts,
              longSharePct: institutional.longSharePct,
              shortSharePct: institutional.shortSharePct,
              netBtcEquivalent: institutional.netBtcEquivalent,
              contractMultiplierBtc: btcResearchRuleConfig.institutionalPositioning.contractMultiplierBtc,
              assetManagerLongTraders: institutional.assetManagerLongTraders,
              assetManagerShortTraders: institutional.assetManagerShortTraders,
              apiUrl: cftcTffApiUrl,
              futuresIntent: "UNKNOWN_OR_HEDGED",
            }
          : {
              reportDate: null,
              unavailableReason: context.institutionalError ? "PROVIDER_ERROR" : "NO_ROW",
              apiUrl: cftcTffApiUrl,
            },
      },
      walletContext: {
        score: walletContext.score,
        value: walletValue,
        interpretation: walletContext.hasObservations
          ? "Net transfers into monitored qualified public wallets support the score; transfers out reduce it. Transfer direction does not prove a buy, sale, identity, or intent."
          : "No qualifying transfer observation was available, so the wallet factor remains neutral rather than inventing smart-money activity.",
        source: "Qualified monitored BTC wallets via mempool.space",
        sourceUrl: walletContext.sourceLinks[0]?.url ?? "https://mempool.space/",
        sourceLinks: walletContext.sourceLinks,
        observedAt: walletContext.latestObservedAt ?? context.evaluatedAt,
        kind: walletContext.hasObservations ? "INFERRED" : "UNVERIFIED",
        details: {
          inflowBtc: walletContext.inflowBtc,
          outflowBtc: walletContext.outflowBtc,
          netBtc: walletContext.netBtc,
          movementCount: walletContext.movementCount,
          activeWalletCount: walletContext.activeWalletCount,
          qualifiedWalletCount: walletContext.qualifiedWalletCount,
          checkedWalletCount: walletContext.checkedWalletCount,
          windowHours: btcResearchRuleConfig.walletContext.windowHours,
          transferIntent: "UNKNOWN",
        },
      },
    });
    const marketReady = context.sourceAvailable && generated.freshness === "FRESH";
    const signalId = stableId(user.id, `${btcResearchRuleVersion}:${context.evaluatedAt.toISOString().slice(0, 10)}`);
    const inputHash = payloadHash({
      consensusHash: context.consensusHash,
      ruleHash: context.researchRule.ruleHash,
      sourceDeviationPct: context.deviation?.toString() ?? null,
      sourceAvailable: context.sourceAvailable,
      institutionalPositioning: institutional
        ? {
            score: institutional.score,
            rawScore: institutional.rawScore,
            reportDate: institutional.reportDate,
            reportAgeDays: institutional.reportAgeDays,
            available: institutional.available,
            netContracts: institutional.netContracts,
            weeklyNetChangeContracts: institutional.weeklyNetChangeContracts,
          }
        : {
            score: btcResearchRuleConfig.institutionalPositioning.neutralScore,
            available: false,
          },
      walletContext: {
        score: walletContext.score,
        inflowBtc: walletContext.inflowBtc,
        outflowBtc: walletContext.outflowBtc,
        movementCount: walletContext.movementCount,
        qualifiedWalletCount: walletContext.qualifiedWalletCount,
      },
    });
    const summary = `${generated.summary} This is a research-only evidence synthesis; it does not recommend an allocation or place an order.`;

    await db.transaction(async (tx) => {
      await tx
        .insert(signals)
        .values({
          id: signalId,
          userId: user.id,
          ruleVersionId: context.researchRule.id,
          instrument: "BTC/USD",
          action: generated.action,
          compositeScore: generated.compositeScore,
          confidence: generated.confidencePct,
          freshnessStatus: generated.freshness,
          summary,
          priceUsd: context.price.toString(),
          change24hPct: context.change24h.toString(),
          mode: "RESEARCH",
          availability: marketReady ? "READY" : "HALTED",
          agreementPct: sourceAgreementPct,
          targetAllocationPct: "0",
          deltaAllocationPct: "0",
          recommendedUsd: "0",
          recommendedBtc: "0",
          hardExit: false,
          inputHash,
          evaluatedAt: context.evaluatedAt,
          expiresAt: new Date(context.evaluatedAt.getTime() + 24 * 60 * 60 * 1000),
        })
        .onDuplicateKeyUpdate({ set: { id: sql`${signals.id}` } });
      await tx
        .insert(signalEvidence)
        .values(
          generated.evidence.map((evidence, index) => ({
            id: stableId(signalId, `research-evidence:${index}:${evidence.group}`),
            signalId,
            marketSnapshotId: null,
            groupName: evidence.group,
            ruleName: evidence.rule,
            weightPct: evidence.weightPct,
            score: evidence.score,
            value: evidence.value,
            interpretation: evidence.interpretation,
            sourceLabel: evidence.source,
            sourceUrl: evidence.sourceUrl,
            observedAt: evidence.observedAt,
            evidenceKind: evidence.kind,
            details: evidence.details,
          })),
        )
        .onDuplicateKeyUpdate({ set: { id: sql`${signalEvidence.id}` } });
    });
    generatedCount += 1;
  }

  return {
    ruleVersion: btcResearchRuleVersion,
    mode: "RESEARCH" as const,
    signalsGenerated: generatedCount,
    signalsAlreadyPresent: existingCount,
    sourceAvailable: context.sourceAvailable,
    institutionalPositioning: institutional
      ? {
          score: institutional.score,
          rawScore: institutional.rawScore,
          reportDate: institutional.reportDate,
          reportAgeDays: institutional.reportAgeDays,
          available: institutional.available,
          netContracts: institutional.netContracts,
          weeklyNetChangeContracts: institutional.weeklyNetChangeContracts,
        }
      : {
          score: btcResearchRuleConfig.institutionalPositioning.neutralScore,
          available: false,
        },
    sourceAgreementPct,
  };
}

async function getBtcWalletContext(userId: string, evaluatedAt: Date) {
  const wallets = await db
    .select({ id: watchlistWallets.id, lastCheckedAt: watchlistWallets.lastCheckedAt })
    .from(watchlistWallets)
    .where(
      and(
        eq(watchlistWallets.userId, userId),
        eq(watchlistWallets.chain, "Bitcoin"),
        eq(watchlistWallets.enabled, true),
        inArray(watchlistWallets.classification, [...qualifiedWalletClassifications]),
      ),
    );
  const since = new Date(
    evaluatedAt.getTime() - btcResearchRuleConfig.walletContext.windowHours * 60 * 60 * 1000,
  );
  const rows = wallets.length
    ? await db
        .select({
          walletId: walletEvents.watchlistWalletId,
          direction: walletEvents.eventType,
          quantityBtc: walletEvents.tokenQuantity,
          occurredAt: walletEvents.occurredAt,
          sourceUrl: walletEvents.sourceUrl,
        })
        .from(walletEvents)
        .where(
          and(
            inArray(walletEvents.watchlistWalletId, wallets.map((wallet) => wallet.id)),
            inArray(walletEvents.eventType, ["TRANSFER_IN", "TRANSFER_OUT"]),
            eq(walletEvents.chain, "Bitcoin"),
            gte(walletEvents.occurredAt, since),
            lte(walletEvents.occurredAt, evaluatedAt),
          ),
        )
        .orderBy(desc(walletEvents.occurredAt))
    : [];
  const derived = deriveBtcWalletContext(
    rows.map((row) => ({
      walletId: row.walletId,
      direction: row.direction as "TRANSFER_IN" | "TRANSFER_OUT",
      quantityBtc: row.quantityBtc,
    })),
  );
  const sourceLinks = [
    ...new Map(
      rows.slice(0, 10).map((row) => [
        row.sourceUrl,
        { label: "Public BTC transaction", url: row.sourceUrl },
      ]),
    ).values(),
  ];
  return {
    ...derived,
    qualifiedWalletCount: wallets.length,
    checkedWalletCount: wallets.filter((wallet) => wallet.lastCheckedAt).length,
    latestObservedAt: rows[0]?.occurredAt,
    sourceLinks,
  };
}

function signedQuantity(value: string) {
  return new Decimal(value).gt(0) ? `+${value}` : value;
}

export async function reconcileDefensiveSignal(
  userId: string,
  signalId: string,
  input: { status: "EXECUTED" | "SKIPPED"; actualPriceUsd?: string; actualQuantityBtc?: string; actualFeeUsd?: string; executedAt?: Date },
): Promise<SignalAcknowledgement> {
  const [signal] = await db.select().from(signals).where(and(eq(signals.id, signalId), eq(signals.userId, userId))).limit(1);
  if (!signal) throw new Error("Signal not found.");
  if (signal.mode !== "VALIDATED" || signal.availability !== "READY") throw new Error("Only ready, validated signals can be reconciled.");
  if (signal.action === "WATCH") throw new Error("WATCH signals do not describe an execution to reconcile.");
  if (signal.expiresAt.getTime() < Date.now()) throw new Error("This signal has expired.");
  if (input.status === "EXECUTED" && (!input.actualPriceUsd || !input.actualQuantityBtc)) throw new Error("Execution price and BTC quantity are required.");

  const [existing] = await db
    .select()
    .from(signalAcknowledgements)
    .where(eq(signalAcknowledgements.signalId, signalId))
    .limit(1);
  if (existing) return mapAcknowledgement(existing);

  if (input.status === "EXECUTED") {
    if (!input.executedAt) throw new Error("Execution time is required.");
    if (input.executedAt < signal.evaluatedAt || input.executedAt > signal.expiresAt) {
      throw new Error("Execution time must fall inside the signal validity window.");
    }
  }

  const acknowledgementId = stableId(signalId, "acknowledgement");
  await db.transaction(async (tx) => {
    await tx.insert(signalAcknowledgements).values({
      id: acknowledgementId,
      signalId,
      userId,
      status: input.status,
      actualPriceUsd: input.actualPriceUsd,
      actualQuantityBtc: input.actualQuantityBtc,
      actualFeeUsd: input.actualFeeUsd,
      executedAt: input.executedAt,
    });
    if (input.status === "EXECUTED") {
      const [profile] = await tx.select().from(btcStrategyProfiles).where(eq(btcStrategyProfiles.userId, userId)).limit(1);
      if (!profile) throw new Error("The BTC strategy sleeve is not configured.");
      const price = new Decimal(input.actualPriceUsd!);
      const quantity = new Decimal(input.actualQuantityBtc!);
      const fee = new Decimal(input.actualFeeUsd ?? 0);
      if (!price.gt(0) || !quantity.gt(0) || fee.lt(0)) throw new Error("Execution values are invalid.");
      const notional = price.mul(quantity);
      const buying = signal.action === "BUY";
      const cash = new Decimal(profile.cashBalanceUsd).add(buying ? notional.add(fee).neg() : notional.sub(fee));
      const btc = new Decimal(profile.btcQuantity).add(buying ? quantity : quantity.neg());
      if (cash.lt(0) || btc.lt(0)) throw new Error("The execution exceeds the confirmed strategy sleeve balance.");
      await tx.update(btcStrategyProfiles).set({ cashBalanceUsd: cash.toString(), btcQuantity: btc.toString() }).where(eq(btcStrategyProfiles.userId, userId));
    }
  });
  const [row] = await db.select().from(signalAcknowledgements).where(eq(signalAcknowledgements.id, acknowledgementId)).limit(1);
  return mapAcknowledgement(row);
}

async function persistDatasets(datasets: BtcHistoryDataset[]) {
  const sources = [
    { id: providerIds.coinbase, provider: "Coinbase Exchange", sourceUrl: "https://api.exchange.coinbase.com" },
    { id: providerIds.binance, provider: "Binance Market Data", sourceUrl: "https://data-api.binance.vision" },
  ];
  for (const source of sources) await db.insert(dataSources).values({ ...source, enabled: true }).onDuplicateKeyUpdate({ set: { enabled: true } });
  for (const dataset of datasets) {
    const sourceId = dataset.source === "Coinbase" ? providerIds.coinbase : providerIds.binance;
    for (let offset = 0; offset < dataset.candles.length; offset += 400) {
      const chunk = dataset.candles.slice(offset, offset + 400);
      await db.insert(marketCandles).values(chunk.map((candle) => ({
        id: stableId(sourceId, `BTC/USD:1D:${candle.date}`),
        dataSourceId: sourceId,
        instrument: "BTC/USD",
        interval: "1D" as const,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume ?? "0",
        openedAt: new Date(`${candle.date}T00:00:00.000Z`),
        closedAt: new Date(`${candle.date}T23:59:59.999Z`),
        finalized: true,
        checksum: payloadHash(candle),
      }))).onDuplicateKeyUpdate({ set: { finalized: true } });
    }
  }
}

async function promoteEligibleShadowProfiles(ruleId: string) {
  const cutoff = new Date(Date.now() - shadowGateDays * 86_400_000);
  const candidates = await db.select().from(btcStrategyProfiles).where(and(eq(btcStrategyProfiles.activeRuleVersionId, ruleId), eq(btcStrategyProfiles.lifecycleStatus, "SHADOW"), lt(btcStrategyProfiles.shadowStartedAt, cutoff)));
  for (const profile of candidates) {
    const [row] = await db.select({ count: sql<number>`count(*)` }).from(signals).where(and(eq(signals.userId, profile.userId), eq(signals.ruleVersionId, ruleId), eq(signals.mode, "SHADOW"), eq(signals.availability, "READY")));
    if (Number(row?.count ?? 0) < shadowGateDays) continue;
    await db.update(btcStrategyProfiles).set({ lifecycleStatus: "VALIDATED" }).where(eq(btcStrategyProfiles.userId, profile.userId));
  }
  const [remaining] = await db.select({ count: sql<number>`count(*)` }).from(btcStrategyProfiles).where(and(eq(btcStrategyProfiles.activeRuleVersionId, ruleId), eq(btcStrategyProfiles.lifecycleStatus, "SHADOW")));
  if (Number(remaining?.count ?? 0) === 0 && candidates.length) await db.update(signalRuleVersions).set({ lifecycleStatus: "VALIDATED" }).where(eq(signalRuleVersions.id, ruleId));
}

async function expireOldSignals() {
  const expired = await db.select({ id: signals.id, userId: signals.userId }).from(signals).leftJoin(signalAcknowledgements, eq(signalAcknowledgements.signalId, signals.id)).where(and(eq(signals.mode, "VALIDATED"), lt(signals.expiresAt, new Date()), sql`${signalAcknowledgements.id} is null`));
  if (expired.length) await db.insert(signalAcknowledgements).values(expired.map((item) => ({ id: stableId(item.id, "acknowledgement"), signalId: item.id, userId: item.userId, status: "EXPIRED" as const })));
}

function summarizeValidation(sourceResults: DefensiveBacktestResult[], stressResults: DefensiveBacktestResult[]): Record<string, unknown> {
  const strip = (result: DefensiveBacktestResult) => ({ ...result, equity: undefined });
  return {
    rule: defensiveRuleConfig,
    sources: sourceResults.map(strip),
    stress: stressResults.map(strip),
    chart: sourceResults[0]?.equity.slice(-730) ?? [],
    acceptance: { maxDrawdownPct: -20, downsideCapturePct: 60, nonnegativeYearPct: 75, shadowDays: shadowGateDays },
    executionModel: "Decision at completed UTC close; next daily open proxy; 25 bps base and 50 bps stress costs.",
  };
}

function mapValidation(row: typeof strategyValidationRuns.$inferSelect): StrategyValidationSummary {
  return {
    id: row.id,
    status: row.status,
    datasetStartedOn: row.datasetStartedOn ?? undefined,
    datasetEndedOn: row.datasetEndedOn ?? undefined,
    ruleHash: row.ruleHash,
    metrics: row.metrics,
    failureReasons: row.failureReasons,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
  };
}

function initialProfileState(
  lifecycleStatus: typeof signalRuleVersions.$inferSelect.lifecycleStatus,
  validatedAt: Date | null,
): Pick<typeof btcStrategyProfiles.$inferInsert, "lifecycleStatus" | "shadowStartedAt"> {
  const profileLifecycle = initialProfileLifecycle(lifecycleStatus);
  return {
    lifecycleStatus: profileLifecycle,
    shadowStartedAt: profileLifecycle === "SHADOW" ? validatedAt ?? new Date() : null,
  };
}

function mapAcknowledgement(
  row: typeof signalAcknowledgements.$inferSelect,
): SignalAcknowledgement {
  return {
    id: row.id,
    signalId: row.signalId,
    status: row.status,
    actualPriceUsd: row.actualPriceUsd ?? undefined,
    actualQuantityBtc: row.actualQuantityBtc ?? undefined,
    actualFeeUsd: row.actualFeeUsd ?? undefined,
    executedAt: row.executedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}
