"use client";

import Link from "next/link";
import Decimal from "decimal.js";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CircleDollarSign, Clock3, Database, Landmark, LineChart, ShieldAlert, WalletCards } from "lucide-react";
import { AllocationChart } from "@/components/charts";
import { MetricCard } from "@/components/metric-card";
import { PageHeader, SectionHeader } from "@/components/page-header";
import { ResearchDisclaimer } from "@/components/research-disclaimer";
import { EntryBadge, FreshnessBadge, SignalBadge } from "@/components/status-badges";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { calculatePortfolio, calculateSpending } from "@/lib/calculations";
import { apiRequest } from "@/lib/api-client";
import { defensiveRuleVersion } from "@/lib/btc-defensive-strategy";
import { btcResearchRuleVersion } from "@/lib/btc-research-rule";
import { formatDecimal, formatMoney, formatPct, monthKey } from "@/lib/format";
import type { BtcStrategyProfile } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";
import { useTerminalStore } from "@/store/terminal-store";

export function OverviewView() {
  const transactions = useTerminalStore((state) => state.transactions);
  const prices = useTerminalStore((state) => state.prices);
  const spending = useTerminalStore((state) => state.spending);
  const signal = useTerminalStore((state) =>
    state.signals.find(
      (item) =>
        item.ruleVersion === defensiveRuleVersion &&
        item.mode === "VALIDATED" &&
        item.availability === "READY",
    ) ?? state.signals.find((item) => item.ruleVersion === btcResearchRuleVersion),
  );
  const event = useTerminalStore((state) => state.events[0]);
  const alerts = useTerminalStore((state) => state.alerts);
  const profile = useTerminalStore((state) => state.profile);
  const rates = useTerminalStore((state) => state.fxRates);
  const portfolio = calculatePortfolio(transactions, prices);
  const cashflow = calculateSpending(spending, monthKey(), rates);
  const incompleteAssets = portfolio.holdings
    .filter((holding) => holding.incompleteBasis)
    .map((holding) => holding.assetSymbol);
  const topWarnings = alerts.filter((alert) => !alert.readAt || alert.severity !== "INFO").slice(0, 3);
  const currency = profile.displayCurrency;
  const [strategy, setStrategy] = useState<BtcStrategyProfile>();
  useEffect(() => { let active = true; void apiRequest<BtcStrategyProfile>("/api/research/btc/strategy").then((result) => { if (active) setStrategy(result); }).catch(() => undefined); return () => { active = false; }; }, []);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Private command center" title={`Good ${greeting()}, ${profile.name.split(" ")[0] || "there"}`} description="One scan of your tracked finances, BTC research posture, and observed positioning and wallet-flow context." actions={<Badge variant={prices[0] ? "success" : "neutral"}><span className="size-1.5 rounded-full bg-current" />{prices[0] ? `Updated ${relativeTime(prices[0].observedAt)}` : "No market data"}</Badge>} />

      {portfolio.incompleteBasis && <div className="flex flex-col gap-3 rounded-lg border border-warning/25 bg-warning/[0.045] p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /><div><p className="text-sm font-medium">Portfolio totals are provisional</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{incompleteAssets.join(", ") || "One or more assets"} has incomplete acquisition value. Quantity is included; cost basis and P&amp;L are flagged incomplete.</p></div></div><Link href="/portfolio" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}>Review ledger<ArrowRight /></Link></div>}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Tracked value" value={formatMoney(portfolio.totalValueUsd, currency, rates)} trend={formatPct(portfolio.dailyChangePct, true)} trendDirection={new Decimal(portfolio.dailyChangePct).gte(0) ? "up" : "down"} detail="24h weighted" icon={<WalletCards />} />
        <MetricCard label="Unrealized P&L" value={formatMoney(portfolio.unrealizedPnlUsd, currency, rates)} trend={formatPct(new Decimal(portfolio.unrealizedPnlUsd).div(portfolio.totalCostBasisUsd || 1).mul(100).toString(), true)} trendDirection={new Decimal(portfolio.unrealizedPnlUsd).gte(0) ? "up" : "down"} detail="provisional" icon={<LineChart />} />
        <MetricCard label="Monthly expenses" value={formatMoney(cashflow.expensesUsd, currency, rates)} trend={formatPct(cashflow.expenseChangePct, true)} trendDirection={new Decimal(cashflow.expenseChangePct).lte(0) ? "up" : "down"} detail="vs last month" icon={<Landmark />} />
        <MetricCard label="Savings rate" value={formatPct(cashflow.savingsRatePct)} trend={formatMoney(cashflow.savingsUsd, currency, rates)} trendDirection="up" detail="retained this month" icon={<CircleDollarSign />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.8fr]">
        <Card>
          <CardHeader><SectionHeader title="Portfolio allocation" description="Calculated from your ledger and latest available market snapshot." meta={<Badge variant="info">Calculated</Badge>} /></CardHeader>
          <CardContent className="grid items-center gap-4 pt-2 md:grid-cols-[0.85fr_1.15fr]">
            <div className="relative"><AllocationChart holdings={portfolio.holdings} currency={currency} rates={rates} /><div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="text-center"><p className="numeric text-lg font-semibold">{portfolio.holdings.length}</p><p className="text-[9px] tracking-wider text-muted-foreground uppercase">Assets</p></div></div></div>
            <div className="space-y-1">
              {portfolio.holdings.map((holding, index) => <Link key={holding.assetSymbol} href="/portfolio" className="flex items-center justify-between rounded-md p-2.5 transition hover:bg-accent"><div className="flex items-center gap-3"><span className={cn("flex size-8 items-center justify-center rounded-full border font-mono text-[10px] font-bold", index === 0 ? "border-primary/30 bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>{holding.assetSymbol.slice(0, 2)}</span><div><p className="text-sm font-medium">{holding.assetSymbol}</p><p className="text-[11px] text-muted-foreground">{formatDecimal(holding.quantity)} {holding.assetSymbol}</p></div></div><div className="text-right"><p className="numeric text-sm font-medium">{formatMoney(holding.currentValueUsd, currency, rates)}</p><p className="numeric text-[11px] text-muted-foreground">{formatPct(holding.allocationPct)}</p></div></Link>)}
            </div>
          </CardContent>
        </Card>

        {signal ? <Card className="overflow-hidden border-warning/20 bg-[linear-gradient(145deg,rgb(246_167_35/0.075),transparent_45%)]">
          <CardHeader><SectionHeader title={signal.mode === "VALIDATED" ? "BTC validated model" : "BTC daily research"} description={signal.mode === "VALIDATED" ? "Validated defensive decision after the UTC daily candle." : "Dual-source market research with bounded CFTC and wallet context; no trade or allocation is executed."} meta={<div className="flex items-center gap-2"><Badge variant={signal.mode === "VALIDATED" ? "success" : "warning"}>{signal.mode}</Badge><FreshnessBadge value={signal.freshness} /></div>} /></CardHeader>
          <CardContent>
            <div className="flex items-end justify-between gap-4"><div><div className="flex items-center gap-2"><SignalBadge value={signal.action} /><span className="font-mono text-[10px] text-muted-foreground">{signal.ruleVersion}</span></div><p className="numeric mt-4 text-3xl font-semibold">{signal.compositeScore}<span className="text-sm font-normal text-muted-foreground"> / 100</span></p><p className="mt-1 text-xs text-muted-foreground">{signal.mode === "VALIDATED" ? "Rule agreement" : "Weighted evidence score"}</p></div><div className="text-right"><p className="numeric text-xl font-semibold">{formatMoney(signal.priceUsd, currency, rates)}</p><p className="numeric mt-1 text-xs text-success">{formatPct(signal.change24hPct, true)} 24h</p></div></div>
            <Progress value={Number(signal.compositeScore)} className="mt-5" indicatorClassName="bg-warning" />
            <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{signal.summary}</p>
            <div className="mt-5 grid grid-cols-3 gap-2 border-t pt-4 text-center"><div><p className="numeric text-sm font-medium">{signal.confidencePct}%</p><p className="mt-1 text-[9px] tracking-wider text-muted-foreground uppercase">Evidence strength</p></div><div><p className="numeric text-sm font-medium">{signal.evidence.length}</p><p className="mt-1 text-[9px] tracking-wider text-muted-foreground uppercase">Factors</p></div><div><p className="numeric text-sm font-medium">{relativeTime(signal.evaluatedAt)}</p><p className="mt-1 text-[9px] tracking-wider text-muted-foreground uppercase">Evaluated</p></div></div>
            <Link href="/btc-research" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "mt-5 w-full")}>Inspect evidence<ArrowRight /></Link>
          </CardContent>
        </Card> : <Card className={strategy?.lifecycleStatus === "REJECTED" ? "border-risk/25" : "border-warning/20"}><CardHeader><SectionHeader title="BTC defensive research" description="Authoritative v2 lifecycle; retired v1 verdicts are excluded." meta={<Badge variant={strategy?.lifecycleStatus === "REJECTED" ? "risk" : "warning"}>{strategy?.lifecycleStatus ?? "LOADING"}</Badge>} /></CardHeader><CardContent><p className="text-sm leading-relaxed text-muted-foreground">{strategy?.lifecycleStatus === "REJECTED" ? "The frozen rule failed independent historical acceptance gates and is not actionable." : "No validated v2 daily signal is available."}</p>{strategy?.latestValidation?.failureReasons[0] && <div className="mt-4 flex gap-2 text-xs text-risk"><ShieldAlert className="mt-0.5 size-3.5 shrink-0" />{strategy.latestValidation.failureReasons[0]}</div>}<Link href="/btc-research" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-5")}>Inspect validation<ArrowRight /></Link></CardContent></Card>}
      </div>

      <Card className="border-primary/20 bg-[linear-gradient(120deg,rgb(104_138_255/0.08),transparent_46%)]">
        <CardHeader><SectionHeader title="Portfolio recap" description="Keep a frozen monthly IDR allocation history alongside the live transaction ledger. Use this for your month-end, gold, and annual CAGR review." meta={<Badge variant="info">Monthly snapshots</Badge>} /></CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="grid grid-cols-3 gap-5 text-xs"><div><p className="font-medium">Monthly allocation</p><p className="mt-1 text-muted-foreground">8 fixed categories</p></div><div><p className="font-medium">Gold holdings</p><p className="mt-1 text-muted-foreground">Lots & valuations</p></div><div><p className="font-medium">Annual return</p><p className="mt-1 text-muted-foreground">CAGR & YoY</p></div></div><Link href="/portfolio?tab=history" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}>Open monthly history<ArrowRight /></Link></CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        {event ? <Card className={cn(event.entryStatus === "EXTENDED" || event.entryStatus === "AVOID" ? "border-risk/30" : "")}>
          <CardHeader><SectionHeader title="Priority smart-money event" description="Observed qualified-wallet proxy activity, not verified institutional identity." meta={<EntryBadge value={event.entryStatus} />} /></CardHeader>
          <CardContent>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><span className="flex size-11 items-center justify-center rounded-xl border border-risk/25 bg-risk/10 font-mono text-sm font-bold text-risk">{event.tokenSymbol.slice(0, 3)}</span><div><p className="font-medium">{event.tokenName} <span className="text-muted-foreground">· {event.chain}</span></p><p className="mt-1 text-xs text-muted-foreground">{event.qualifiedWalletCount} qualified wallets · first seen {relativeTime(event.firstDetectedAt)}</p></div></div><div className="text-left sm:text-right"><p className="numeric text-xl font-semibold text-risk">{formatPct(event.priceChangePct, true)}</p><p className="text-[10px] tracking-wider text-muted-foreground uppercase">Since detection</p></div></div>
            <div className="mt-5 grid grid-cols-3 gap-3 border-y py-4"><SmallMetric label="Net observed buy" value={formatMoney(event.netBuyUsd, currency, rates, true)} /><SmallMetric label="Liquidity" value={formatMoney(event.liquidityUsd, currency, rates, true)} /><SmallMetric label="24h volume" value={formatMoney(event.volume24hUsd, currency, rates, true)} /></div>
            <div className="mt-4 flex items-start gap-2.5 text-xs leading-relaxed text-risk"><ShieldAlert className="mt-0.5 size-3.5 shrink-0" /><span>{event.riskFactors[0]}. Late-entry risk is visually prioritized over the observed buying.</span></div>
            <Link href={`/smart-money?event=${event.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-5")}>Open evidence trail<ArrowRight /></Link>
          </CardContent>
        </Card> : <EmptyOverviewCard title="Priority smart-money event" description="No public-wallet events have been observed. Add a wallet and run wallet synchronization to begin." href="/smart-money" />}

        <Card>
          <CardHeader><SectionHeader title="Data quality & alerts" description={`${topWarnings.length} items currently need attention.`} meta={<Database className="size-4 text-muted-foreground" />} /></CardHeader>
          <CardContent className="space-y-2">
            {topWarnings.map((alert) => <div key={alert.id} className="flex gap-3 rounded-md border bg-background/40 p-3"><span className={cn("mt-1 size-2 shrink-0 rounded-full", alert.severity === "HIGH_RISK" ? "bg-risk" : alert.severity === "WARNING" ? "bg-warning" : "bg-info")} /><div><p className="text-xs font-medium">{alert.title}</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{alert.description}</p></div><span className="ml-auto shrink-0 font-mono text-[9px] text-muted-foreground">{relativeTime(alert.createdAt)}</span></div>)}
            <div className="flex items-center gap-2 pt-2 text-[10px] text-muted-foreground"><Clock3 className="size-3" />Market data freshness threshold: 15 minutes</div>
          </CardContent>
        </Card>
      </div>
      <ResearchDisclaimer />
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) { return <div><p className="numeric truncate text-sm font-semibold">{value}</p><p className="mt-1 truncate text-[9px] tracking-wider text-muted-foreground uppercase">{label}</p></div>; }
function EmptyOverviewCard({ title, description, href }: { title: string; description: string; href: string }) { return <Card><CardHeader><SectionHeader title={title} description={description} /></CardHeader><CardContent><Link href={href} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Open setup<ArrowRight /></Link></CardContent></Card>; }
function greeting() { const hour = new Date().getHours(); return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"; }
