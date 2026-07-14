import Decimal from "decimal.js";
import { expect, test } from "vitest";
import {
  btcResearchRuleConfig,
  btcResearchRuleVersion,
  deriveCftcBtcInstitutionalContext,
} from "@/lib/btc-research-rule";
import {
  buildConsensusCandles,
  consensusDeviationPct,
  fetchBtcHistoryDatasets,
  lastCompletedUtcDate,
} from "@/server/providers/btc-history";
import {
  cftcTffDatasetUrl,
  fetchCftcBtcInstitutionalPositioning,
} from "@/server/providers/cftc";
import { generateBtcSignal } from "@/server/signal-engine";

test.skipIf(process.env.LIVE_PROVIDER_AUDIT !== "1")(
  "audits the current BTC research rule against every live public provider",
  async () => {
    const [datasets, cftcSnapshot] = await Promise.all([
      fetchBtcHistoryDatasets(false),
      fetchCftcBtcInstitutionalPositioning(),
    ]);
    const consensus = buildConsensusCandles(datasets);
    const latest = consensus.at(-1)!;
    const deviation = consensusDeviationPct(datasets, latest.date);
    const institutional = deriveCftcBtcInstitutionalContext(
      cftcSnapshot,
      new Date(`${latest.date}T23:59:59.999Z`),
    );
    const sourceAvailable = Boolean(
      deviation && deviation.lte(btcResearchRuleConfig.consensusMaxDeviationPct),
    );
    const signal = generateBtcSignal(
      consensus.map((candle) => ({
        date: candle.date,
        close: candle.close,
        observedAt: new Date(`${candle.date}T23:59:59.999Z`),
      })),
      {
        now: new Date(),
        marketSource: {
          label: "Coinbase + Binance completed UTC daily-candle consensus",
          sourceUrl: datasets[0].sourceUrl,
          sourceLinks: datasets.map((dataset) => ({
            label: `${dataset.source} BTC daily candles`,
            url: dataset.sourceUrl,
          })),
          available: sourceAvailable,
          deviationPct: deviation?.toString(),
        },
        institutionalContext: {
          score: institutional.score,
          value: `${institutional.longContracts} long / ${institutional.shortContracts} short contracts`,
          interpretation: "Official weekly CFTC institutional futures proxy.",
          source: "CFTC TFF Futures Only",
          sourceUrl: cftcTffDatasetUrl,
          observedAt: new Date(`${institutional.reportDate}T23:59:59.999Z`),
          kind: institutional.stale ? "STALE" : "CALCULATED",
          available: institutional.available,
        },
        walletContextScore: "50",
      },
    );

    expect(datasets).toHaveLength(2);
    expect(datasets.every((dataset) => dataset.candles.length >= 390)).toBe(true);
    expect(latest.date).toBe(lastCompletedUtcDate());
    expect(deviation).toBeDefined();
    expect(deviation!.lte(btcResearchRuleConfig.consensusMaxDeviationPct)).toBe(true);
    expect(institutional.available).toBe(true);
    expect(signal.riskKillSwitch).toBe(false);
    expect(signal.evidence).toHaveLength(6);
    expect(
      signal.evidence.find((item) => item.group === "CFTC institutional positioning")?.score,
    ).toBe(institutional.score);

    const previous = new Decimal(consensus.at(-2)!.close);
    const current = new Decimal(latest.close);
    console.info(
      "LIVE_SIGNAL_AUDIT",
      JSON.stringify({
        ruleVersion: btcResearchRuleVersion,
        evaluatedDate: latest.date,
        sourceCandleCounts: Object.fromEntries(
          datasets.map((dataset) => [dataset.source, dataset.candles.length]),
        ),
        sourceDeviationPct: deviation!.toFixed(4),
        closeUsd: current.toFixed(2),
        change24hPct: current.div(previous).sub(1).mul(100).toFixed(2),
        cftcReportDate: institutional.reportDate,
        cftcReportAgeDays: institutional.reportAgeDays,
        cftcInstitutionalScore: institutional.score,
        cftcNetContracts: institutional.netContracts,
        cftcWeeklyNetChangeContracts: institutional.weeklyNetChangeContracts,
        walletScore: "50.00",
        compositeScore: signal.compositeScore,
        action: signal.action,
        confidencePct: signal.confidencePct,
        freshness: signal.freshness,
      }),
    );
  },
  60_000,
);
