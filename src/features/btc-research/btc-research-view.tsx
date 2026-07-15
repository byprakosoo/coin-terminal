"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bitcoin, BookOpenCheck, CalendarClock, CheckCircle2, ExternalLink, LoaderCircle, ShieldCheck, Target } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionHeader } from "@/components/page-header";
import { ResearchDisclaimer } from "@/components/research-disclaimer";
import { EvidenceBadge, FreshnessBadge, SignalBadge } from "@/components/status-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiRequest, jsonBody } from "@/lib/api-client";
import { defensiveRuleVersion } from "@/lib/btc-defensive-strategy";
import { btcResearchRuleVersion } from "@/lib/btc-research-rule";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { BtcStrategyProfile } from "@/lib/types";
import { useTerminalStore } from "@/store/terminal-store";

interface ValidationSourceMetric {
  source: string;
  startedOn: string;
  endedOn: string;
  evaluatedDays: number;
  nonnegativeYearPct: string;
  downsideCapturePct: string;
  strategy: { returnPct: string; cagrPct: string; maxDrawdownPct: string; sortino: string; calmar: string };
  balancedBuyHold: { returnPct: string; maxDrawdownPct: string; sortino: string; calmar: string };
}

export function BtcResearchView() {
  const allSignals = useTerminalStore((state) => state.signals);
  const timezone = useTerminalStore((state) => state.profile.timezone);
  const currency = useTerminalStore((state) => state.profile.displayCurrency);
  const rates = useTerminalStore((state) => state.fxRates);
  const defensiveSignals = useMemo(
    () => allSignals.filter((item) => item.ruleVersion === defensiveRuleVersion),
    [allSignals],
  );
  const researchSignals = useMemo(
    () => allSignals.filter(
      (item) =>
        item.mode === "RESEARCH" &&
        item.ruleVersion.startsWith("btc-consensus-research-"),
    ),
    [allSignals],
  );
  const signal = defensiveSignals[0];
  const researchSignal = researchSignals.find(
    (item) => item.ruleVersion === btcResearchRuleVersion,
  );
  const [strategy, setStrategy] = useState<BtcStrategyProfile>();
  const [error, setError] = useState<string>();
  const [dialog, setDialog] = useState<"EXECUTED" | "SKIPPED">();
  const [price, setPrice] = useState(signal?.priceUsd ?? "");
  const [quantity, setQuantity] = useState(signal?.recommendedBtc ?? "");
  const [fee, setFee] = useState("0");
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    let active = true;
    void apiRequest<BtcStrategyProfile>("/api/research/btc/strategy")
      .then((result) => { if (active) setStrategy(result); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Strategy status is unavailable."); });
    return () => { active = false; };
  }, []);

  const metrics = strategy?.latestValidation?.metrics as { sources?: ValidationSourceMetric[]; stress?: ValidationSourceMetric[]; executionModel?: string } | undefined;
  const openExecutionDialog = () => {
    if (!signal) return;
    setPrice(signal.priceUsd);
    setQuantity(signal.recommendedBtc);
    setDialog("EXECUTED");
  };
  const reconcile = async () => {
    if (!dialog || !signal) return;
    try {
      await apiRequest(`/api/research/btc/signals/${signal.id}/reconcile`, {
        method: "POST",
        body: jsonBody(dialog === "SKIPPED" ? { status: dialog } : {
          status: dialog,
          actualPriceUsd: price,
          actualQuantityBtc: quantity,
          actualFeeUsd: fee,
          executedAt: new Date().toISOString(),
        }),
      });
      toast.success(dialog === "SKIPPED" ? "Signal marked as skipped" : "Execution reconciled");
      setDialog(undefined);
    } catch (reason) {
      toast.error("Signal could not be reconciled", { description: reason instanceof Error ? reason.message : undefined });
    }
  };
  const runValidation = async () => {
    setValidating(true);
    try {
      await apiRequest("/api/research/btc/validation", { method: "POST" });
      const refreshed = await apiRequest<BtcStrategyProfile>("/api/research/btc/strategy");
      setStrategy(refreshed);
      toast.success(refreshed.latestValidation?.status === "PASSED" ? "Historical gates passed" : "Historical gates rejected the rule", { description: "The result and every failure reason are now persisted." });
    } catch (reason) {
      toast.error("Historical validation could not finish", { description: reason instanceof Error ? reason.message : undefined });
    } finally {
      setValidating(false);
    }
  };

  if (!strategy && !error) return <div className="flex min-h-[28rem] items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading the defensive strategy…</div>;
  if (!strategy) return <Card className="border-risk/25"><CardContent className="flex min-h-48 items-center justify-center gap-2 text-sm text-risk"><AlertTriangle className="size-4" />{error}</CardContent></Card>;

  const validation = strategy.latestValidation;
  const readyShadowObservations = Math.min(strategy.shadowDays, strategy.shadowSignals);
  const shadowProgress = Math.min(100, readyShadowObservations / 180 * 100);
  const actionable = strategy.lifecycleStatus === "VALIDATED" && signal?.mode === "VALIDATED" && signal.availability === "READY" && signal.action !== "WATCH";
  const walletEvidence = researchSignal?.evidence.find(
    (item) => item.group === "Public-wallet context",
  );
  const institutionalEvidence = researchSignal?.evidence.find(
    (item) => item.group === "CFTC institutional positioning",
  );

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="BTC / USD · Daily UTC close" title="Bitcoin research & defensive system" description="Daily dual-source directional research sits beside a separately gated long/cash model; neither is presented as more validated than its evidence allows." actions={<><Badge variant={strategy.lifecycleStatus === "VALIDATED" ? "success" : strategy.lifecycleStatus === "REJECTED" ? "risk" : "warning"}>MODEL {strategy.lifecycleStatus}</Badge>{researchSignal && <FreshnessBadge value={researchSignal.freshness} />}</>} />
      <ResearchDisclaimer />

      {strategy.lifecycleStatus !== "VALIDATED" && <div className="flex gap-3 rounded-lg border border-warning/25 bg-warning/[0.04] p-4"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /><div><p className="text-sm font-medium">The allocation model is not actionable</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">The defensive model is {strategy.lifecycleStatus.toLowerCase()}. The separate daily research verdict remains informational; model recommendations stay hypothetical until historical gates pass and 180 ready shadow signals complete. No trades are executed by this app.</p></div></div>}

      {researchSignal ? <Card className="overflow-hidden border-primary/25 bg-[radial-gradient(circle_at_15%_0%,rgb(246_167_35/0.11),transparent_21rem)]">
        <CardHeader><SectionHeader title="Daily consensus research" description="A transparent weighted verdict from agreeing Coinbase/Binance completed candles, official weekly CFTC institutional positioning, and qualified public BTC wallet transfers." meta={<div className="flex items-center gap-2"><Badge variant={researchSignal.availability === "READY" ? "warning" : "risk"}>RESEARCH ONLY</Badge><FreshnessBadge value={researchSignal.freshness} /></div>} /></CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
            <div><div className="flex items-center gap-2"><SignalBadge value={researchSignal.action} /><span className="font-mono text-[10px] text-muted-foreground">{researchSignal.ruleVersion}</span></div><p className="numeric mt-4 text-4xl font-semibold">{researchSignal.compositeScore}<span className="text-sm font-normal text-muted-foreground"> / 100</span></p><p className="mt-1 text-[10px] tracking-wider text-muted-foreground uppercase">Weighted evidence score</p><Progress value={Number(researchSignal.compositeScore)} className="mt-4" indicatorClassName="bg-primary" /></div>
            <div className="space-y-4"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Source agreement" value={`${researchSignal.agreementPct}%`} /><Metric label="Evidence strength" value={`${researchSignal.confidencePct}%`} /><Metric label="BTC close" value={formatMoney(researchSignal.priceUsd, currency, rates)} /><Metric label="Availability" value={researchSignal.availability} /></div><p className="text-xs leading-relaxed text-muted-foreground">{researchSignal.summary}</p>{(institutionalEvidence || walletEvidence) && <div className="grid gap-3 sm:grid-cols-2">{institutionalEvidence && <div className="rounded-md border bg-background/45 p-3"><p className="text-[9px] tracking-wider text-muted-foreground uppercase">CFTC institutional futures proxy</p><p className="numeric mt-1 text-sm font-medium">{institutionalEvidence.value}</p><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Weekly Asset Manager/Institutional futures positions are delayed and may be hedges; they do not prove spot-market intent.</p></div>}{walletEvidence && <div className="rounded-md border bg-background/45 p-3"><p className="text-[9px] tracking-wider text-muted-foreground uppercase">Public-wallet transfer context</p><p className="numeric mt-1 text-sm font-medium">{walletEvidence.value}</p><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Transfers are not labeled as buys or sells; identity and intent remain uncertain.</p></div>}</div>}</div>
          </div>
          <div className="grid gap-3 border-t pt-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">{researchSignal.evidence.map((item) => <div key={item.id} className="rounded-lg border bg-background/40 p-3"><div className="flex items-start justify-between gap-2"><p className="text-xs font-medium">{item.group}</p><EvidenceBadge value={item.kind} /></div><p className="numeric mt-4 text-2xl font-semibold">{item.score}<span className="text-xs font-normal text-muted-foreground"> / 100</span></p><p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{item.value} · {item.weightPct}% weight</p><div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">{(item.sourceLinks?.length ? item.sourceLinks : [{ label: item.source, url: item.sourceUrl }]).map((source) => <a key={`${item.id}:${source.url}`} href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-info hover:underline">{source.label}<ExternalLink className="size-3" /></a>)}</div></div>)}</div>
        </CardContent>
      </Card> : <Card className="border-warning/25"><CardContent className="flex min-h-40 flex-col items-center justify-center text-center"><CalendarClock className="size-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No daily consensus research yet</p><p className="mt-1 max-w-lg text-xs text-muted-foreground">Run the BTC daily job after both completed-candle providers are reachable. A missing verdict is shown instead of falling back to a retired rule.</p></CardContent></Card>}

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="border-primary/25 bg-[radial-gradient(circle_at_20%_10%,rgb(246_167_35/0.10),transparent_17rem)]">
          <CardHeader><SectionHeader title="Current model state" description={signal ? `Completed candle ${signal.evaluatedAt.slice(0, 10)} · expires after the next UTC close.` : "Waiting for the first post-validation daily evaluation."} meta={<Bitcoin className="size-5 text-primary" />} /></CardHeader>
          <CardContent>
            {signal ? <div className="space-y-5">
              <div className="flex items-end justify-between gap-4"><div><SignalBadge value={signal.action} /><p className="numeric mt-3 text-4xl font-semibold">{signal.targetAllocationPct}%</p><p className="mt-1 text-[10px] tracking-wider text-muted-foreground uppercase">Model BTC target</p></div><div className="text-right"><p className="numeric text-xl font-semibold">{formatMoney(signal.priceUsd, currency, rates)}</p><p className="mt-1 text-[10px] text-muted-foreground">Coinbase/Binance close consensus</p></div></div>
              <div className="grid grid-cols-3 gap-3"><Metric label="Evidence agreement" value={`${signal.agreementPct}%`} /><Metric label="Target change" value={`${Number(signal.deltaAllocationPct) > 0 ? "+" : ""}${signal.deltaAllocationPct} pts`} /><Metric label="Availability" value={signal.availability} /></div>
              <p className="text-xs leading-relaxed text-muted-foreground">{signal.summary}</p>
              {signal.hardExit && <Badge variant="risk"><AlertTriangle />Full-exit override</Badge>}
              {actionable && <div className="flex flex-wrap gap-2"><Button onClick={openExecutionDialog}>Reconcile execution</Button><Button variant="outline" onClick={() => setDialog("SKIPPED")}>Mark skipped</Button></div>}
            </div> : <div className="flex min-h-56 flex-col items-center justify-center text-center"><CalendarClock className="size-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No v2 daily signal yet</p><p className="mt-1 max-w-sm text-xs text-muted-foreground">Legacy v1 signals are intentionally excluded from this decision panel.</p></div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><SectionHeader title="Validation lifecycle" description="Passing history starts the shadow clock; it does not immediately authorize a BUY or SELL recommendation." meta={<ShieldCheck className="size-5 text-info" />} /></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3"><Metric label="Historical gates" value={validation?.status ?? "NOT RUN"} /><Metric label="Ready shadow closes" value={`${readyShadowObservations} / 180`} /><Metric label="Rule version" value="v2.0.0" /></div>
            <div><div className="mb-2 flex justify-between text-[10px] text-muted-foreground"><span>Shadow validation · {strategy.shadowDays} elapsed days</span><span>{readyShadowObservations} / 180 ready closes</span></div><Progress value={shadowProgress} indicatorClassName={strategy.lifecycleStatus === "REJECTED" ? "bg-risk" : "bg-warning"} /></div>
            <div className="rounded-md border bg-background/45 p-3 font-mono text-[10px] text-muted-foreground"><p>Rule hash: {strategy.ruleHash}</p>{validation && <p className="mt-1">Dataset: {validation.datasetStartedOn ?? "—"} → {validation.datasetEndedOn ?? "—"}</p>}</div>
            {validation?.failureReasons.map((reason) => <div key={reason} className="flex gap-2 text-xs text-risk"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{reason}</div>)}
            {validation?.status !== "PASSED" && <Button variant="outline" disabled={validating} onClick={() => void runValidation()}>{validating ? <LoaderCircle className="animate-spin" /> : <Activity />}{validating ? "Validating both histories…" : validation ? "Re-run historical validation" : "Run historical validation"}</Button>}
          </CardContent>
        </Card>
      </div>

      {signal && <Card><CardHeader><SectionHeader title="Decision evidence" description="Five equal, deterministic checks. Agreement is evidence coverage—not a win probability." meta={<Target className="size-4 text-muted-foreground" />} /></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{signal.evidence.map((item) => <div key={item.id} className="rounded-lg border bg-background/40 p-3"><div className="flex items-start justify-between gap-2"><p className="text-xs font-medium">{item.group}</p><EvidenceBadge value={item.kind} /></div><p className={`numeric mt-4 text-2xl font-semibold ${Number(item.score) === 100 ? "text-success" : "text-risk"}`}>{Number(item.score) === 100 ? "PASS" : "FAIL"}</p><p className="mt-2 text-[10px] text-muted-foreground">{item.value} · {item.rule}</p><div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">{(item.sourceLinks?.length ? item.sourceLinks : [{ label: "Public source", url: item.sourceUrl }]).map((source) => <a key={`${item.id}:${source.url}`} href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-info hover:underline">{source.label}<ExternalLink className="size-3" /></a>)}</div></div>)}</CardContent></Card>}

      <Card><CardHeader><SectionHeader title="Historical acceptance record" description={metrics?.executionModel ?? "Base costs 25 bps; stress costs 50 bps."} meta={<BookOpenCheck className="size-4 text-muted-foreground" />} /></CardHeader><CardContent>{metrics?.sources?.length ? <div className="overflow-hidden rounded-lg border"><Table><TableHeader><TableRow><TableHead>Source</TableHead><TableHead>Net return</TableHead><TableHead>Max drawdown</TableHead><TableHead>Sortino</TableHead><TableHead>Calmar</TableHead><TableHead>Downside capture</TableHead><TableHead>Nonnegative years</TableHead></TableRow></TableHeader><TableBody>{metrics.sources.map((row) => <TableRow key={row.source}><TableCell><div className="font-medium">{row.source}</div><div className="text-[9px] text-muted-foreground">{row.startedOn} → {row.endedOn}</div></TableCell><TableCell className="numeric">{row.strategy.returnPct}%</TableCell><TableCell className="numeric">{row.strategy.maxDrawdownPct}%</TableCell><TableCell className="numeric">{row.strategy.sortino}</TableCell><TableCell className="numeric">{row.strategy.calmar}</TableCell><TableCell className="numeric">{row.downsideCapturePct}%</TableCell><TableCell className="numeric">{row.nonnegativeYearPct}%</TableCell></TableRow>)}</TableBody></Table></div> : <div className="flex min-h-36 items-center justify-center gap-2 text-xs text-muted-foreground"><Activity className="size-4" />Historical validation has not produced a record yet.</div>}</CardContent></Card>

      <Card><CardHeader><SectionHeader title="Daily research history" description="Research-only directional verdicts generated from every persisted frozen consensus-rule version." /></CardHeader><CardContent className="px-0">{researchSignals.length ? <Table><TableHeader><TableRow><TableHead className="pl-5">Evaluated</TableHead><TableHead>Rule</TableHead><TableHead>Verdict</TableHead><TableHead>Score</TableHead><TableHead>Source agreement</TableHead><TableHead>Availability</TableHead><TableHead className="pr-5">Context</TableHead></TableRow></TableHeader><TableBody>{researchSignals.map((item) => <TableRow key={item.id}><TableCell className="pl-5 text-xs">{formatDateTime(item.evaluatedAt, timezone)}</TableCell><TableCell className="font-mono text-[10px]">{item.ruleVersion}</TableCell><TableCell><SignalBadge value={item.action} /></TableCell><TableCell className="numeric">{item.compositeScore}</TableCell><TableCell className="numeric">{item.agreementPct}%</TableCell><TableCell><Badge variant={item.availability === "READY" ? "warning" : "risk"}>{item.availability}</Badge></TableCell><TableCell className="max-w-lg pr-5 text-xs text-muted-foreground">{item.summary}</TableCell></TableRow>)}</TableBody></Table> : <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">No consensus research signals have been generated.</div>}</CardContent></Card>

      <Card><CardHeader><SectionHeader title="v2 signal history" description="Only signals generated by the frozen defensive rule are listed." /></CardHeader><CardContent className="px-0">{defensiveSignals.length ? <Table><TableHeader><TableRow><TableHead className="pl-5">Evaluated</TableHead><TableHead>Mode</TableHead><TableHead>Verdict</TableHead><TableHead>Target</TableHead><TableHead>Agreement</TableHead><TableHead className="pr-5">Context</TableHead></TableRow></TableHeader><TableBody>{defensiveSignals.map((item) => <TableRow key={item.id}><TableCell className="pl-5 text-xs">{formatDateTime(item.evaluatedAt, timezone)}</TableCell><TableCell><Badge variant={item.mode === "VALIDATED" ? "success" : "warning"}>{item.mode}</Badge></TableCell><TableCell><SignalBadge value={item.action} /></TableCell><TableCell className="numeric">{item.targetAllocationPct}%</TableCell><TableCell className="numeric">{item.agreementPct}%</TableCell><TableCell className="max-w-lg pr-5 text-xs text-muted-foreground">{item.summary}</TableCell></TableRow>)}</TableBody></Table> : <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">No defensive signals have been generated.</div>}</CardContent></Card>

      <Dialog open={Boolean(dialog)} onOpenChange={(open) => !open && setDialog(undefined)}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{dialog === "SKIPPED" ? "Mark this signal skipped?" : "Reconcile your execution"}</DialogTitle><DialogDescription>This records what you did outside Coin Terminal. The app does not connect to an exchange or place a trade.</DialogDescription></DialogHeader>{dialog === "EXECUTED" && <div className="grid gap-4 py-2"><Field label="Actual BTC price (USD)" value={price} setValue={setPrice} /><Field label="Actual BTC quantity" value={quantity} setValue={setQuantity} /><Field label="Fee (USD)" value={fee} setValue={setFee} /></div>}<DialogFooter><Button variant="ghost" onClick={() => setDialog(undefined)}>Cancel</Button><Button onClick={() => void reconcile()}>{dialog === "SKIPPED" ? <CalendarClock /> : <CheckCircle2 />}{dialog === "SKIPPED" ? "Mark skipped" : "Save execution"}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border bg-background/40 p-3"><p className="numeric truncate text-lg font-semibold">{value}</p><p className="mt-1 text-[9px] tracking-wider text-muted-foreground uppercase">{label}</p></div>;
}

function Field({ label, value, setValue }: { label: string; value: string; setValue: (value: string) => void }) {
  const id = label.toLowerCase().replaceAll(/[^a-z]+/g, "-");
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} /></div>;
}
