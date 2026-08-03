"use client";

import Link from "next/link";
import Decimal from "decimal.js";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CircleDollarSign, Clock3, Database, Landmark, ShieldAlert, WalletCards } from "lucide-react";
import { NetWorthAllocationChart } from "@/components/charts";
import { MetricCard } from "@/components/metric-card";
import { PageHeader, SectionHeader } from "@/components/page-header";
import { ResearchDisclaimer } from "@/components/research-disclaimer";
import { EntryBadge, FreshnessBadge, SignalBadge } from "@/components/status-badges";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { calculatePortfolio, calculateSpending, latestSpendingMonth } from "@/lib/calculations";
import { apiRequest } from "@/lib/api-client";
import { defensiveRuleVersion } from "@/lib/btc-defensive-strategy";
import { btcResearchRuleVersion } from "@/lib/btc-research-rule";
import { usePortfolioRecap } from "@/features/portfolio-recap/use-portfolio-recap";
import { RECAP_CATEGORIES } from "@/features/portfolio-recap/types";
import { formatMoney, formatNativeMoney, formatPct } from "@/lib/format";
import type { BtcStrategyProfile } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";
import { useTerminalStore } from "@/store/terminal-store";

export function OverviewView() {
  const transactions = useTerminalStore((state) => state.transactions);
  const prices = useTerminalStore((state) => state.prices);
  const spending = useTerminalStore((state) => state.spending);
  const signal = useTerminalStore((state) =>
    [...state.signals]
      .filter(
        (item) =>
          (item.ruleVersion === defensiveRuleVersion &&
            item.mode === "VALIDATED" &&
            item.availability === "READY") ||
          item.ruleVersion === btcResearchRuleVersion,
      )
      .sort((a, b) => new Date(b.evaluatedAt).getTime() - new Date(a.evaluatedAt).getTime())[0],
  );
  const event = useTerminalStore((state) => state.events[0]);
  const alerts = useTerminalStore((state) => state.alerts);
  const profile = useTerminalStore((state) => state.profile);
  const rates = useTerminalStore((state) => state.fxRates);
  const portfolio = calculatePortfolio(transactions, prices);
  const latestExpenseMonth = latestSpendingMonth(spending);
  const latestExpenseSummary = calculateSpending(spending, latestExpenseMonth, rates);
  const recap = usePortfolioRecap();
  const latestNetWorth = recap.data?.latestSummary;
  const latestSnapshot = recap.data?.snapshots.length
    ? [...recap.data.snapshots].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate) || a.sequence - b.sequence).at(-1)
    : undefined;
  const netWorthRows = latestSnapshot
    ? RECAP_CATEGORIES
      .map((category) => ({
        ...category,
        valueIdr: latestSnapshot[category.key],
        allocationPct: latestNetWorth?.allocationPct[category.key] ?? "0",
      }))
      .filter((item) => new Decimal(item.valueIdr).gt(0))
    : [];
  const netWorthChartData = netWorthRows
    .map((item) => ({ name: item.label, value: netWorthDisplayAmount(item.valueIdr, latestSnapshot?.idrPerUsd, profile.displayCurrency) }))
    .filter((item) => item.value > 0);
  const netWorthValue = latestNetWorth
    ? currencyValue(latestNetWorth.totalIdr, latestNetWorth.totalUsd, profile.displayCurrency)
    : "—";
  const netWorthDetail = latestNetWorth
    ? `Monthly History · ${latestNetWorth.asOfDate}`
    : recap.loading
      ? "Loading Monthly History"
      : recap.error
        ? "Monthly History unavailable"
        : "No Monthly History snapshot";
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

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Total portfolio net worth" value={netWorthValue} detail={netWorthDetail} icon={<WalletCards />} />
        <MetricCard label="Monthly expenses" value={formatMoney(latestExpenseSummary.expensesUsd, currency, rates)} trend={formatPct(latestExpenseSummary.expenseChangePct, true)} trendDirection={new Decimal(latestExpenseSummary.expenseChangePct).lte(0) ? "up" : "down"} detail={`${latestExpenseMonth} · latest spending month`} icon={<Landmark />} />
        <MetricCard label="last month savings" value={formatPct(latestExpenseSummary.savingsRatePct)} trend={formatMoney(latestExpenseSummary.savingsUsd, currency, rates)} trendDirection={new Decimal(latestExpenseSummary.savingsRatePct).gte(0) ? "up" : "down"} detail={`${latestExpenseMonth} · savings rate`} icon={<CircleDollarSign />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.8fr]">
        <Card>
          <CardHeader><SectionHeader title="Net worth breakdown" description={latestSnapshot ? `Latest Monthly History snapshot · ${latestSnapshot.asOfDate}` : "Monthly History has no snapshot to break down."} meta={<div className="text-right"><p className="numeric text-sm font-semibold">{netWorthValue}</p><p className="text-[9px] tracking-wider text-muted-foreground uppercase">Net worth</p></div>} /></CardHeader>
          <CardContent className="grid items-center gap-4 pt-2 md:grid-cols-[0.85fr_1.15fr]">
            <div className="relative"><NetWorthAllocationChart data={netWorthChartData} currency={currency} /><div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="text-center"><p className="numeric text-lg font-semibold">{netWorthRows.length}</p><p className="text-[9px] tracking-wider text-muted-foreground uppercase">Categories</p></div></div></div>
            <div className="space-y-1">
              {netWorthRows.length ? netWorthRows.map((item, index) => <Link key={item.key} href="/portfolio?tab=history" className="block rounded-md p-2.5 transition hover:bg-accent"><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-bold", index === 0 ? "border-primary/30 bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>{item.label.slice(0, 2)}</span><div className="min-w-0"><p className="truncate text-sm font-medium">{item.label}</p><p className="truncate text-[11px] text-muted-foreground">Latest snapshot value</p></div></div><div className="shrink-0 text-right"><p className="numeric text-sm font-medium">{formatNetWorthValue(item.valueIdr, latestSnapshot?.idrPerUsd, currency)}</p><p className="numeric text-[11px] text-muted-foreground">{formatPct(item.allocationPct)}</p></div></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary/75" style={{ width: `${Math.min(100, Math.max(0, Number(item.allocationPct)))}%` }} /></div></Link>) : <div className="rounded-md border border-dashed p-4 text-center"><p className="text-sm font-medium">No net worth breakdown yet</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Add a snapshot in Monthly History to see the latest asset allocation here.</p><Link href="/portfolio?tab=history" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3")}>Open Monthly History<ArrowRight /></Link></div>}
            </div>
          </CardContent>
        </Card>

        {signal ? <Card className={cn("overflow-hidden bg-[linear-gradient(145deg,rgb(246_167_35/0.075),transparent_45%)]", signal.availability === "HALTED" ? "border-risk/30" : "border-warning/20")}>
          <CardHeader><SectionHeader title="Bitcoin signal" description={signal.availability === "HALTED" ? "The latest signal is halted because required market evidence is unavailable or stale." : "Latest directional research for BTC. BUY, SELL, and WATCH are informational signals—not guaranteed predictions."} meta={<div className="flex items-center gap-2"><Badge variant={signal.mode === "VALIDATED" ? "success" : "warning"}>{signal.mode === "VALIDATED" ? "VALIDATED MODEL" : "RESEARCH"}</Badge><FreshnessBadge value={signal.freshness} /></div>} /></CardHeader>
          <CardContent>
            <div className="flex items-end justify-between gap-4"><div><div className="flex items-center gap-2"><p className={cn("numeric text-3xl font-semibold", signal.action === "BUY" ? "text-success" : signal.action === "SELL" ? "text-risk" : "text-warning")}>{signal.action}</p><SignalBadge value={signal.action} /></div><p className="mt-1 font-mono text-[10px] text-muted-foreground">{signal.ruleVersion}</p><p className="numeric mt-4 text-2xl font-semibold">{signal.compositeScore}<span className="text-sm font-normal text-muted-foreground"> / 100</span></p><p className="mt-1 text-xs text-muted-foreground">Weighted evidence score</p></div><div className="text-right"><p className="numeric text-xl font-semibold">{formatMoney(signal.priceUsd, currency, rates)}</p><p className={cn("numeric mt-1 text-xs", new Decimal(signal.change24hPct).gte(0) ? "text-success" : "text-risk")}>{formatPct(signal.change24hPct, true)} 24h</p></div></div>
            <Progress value={Number(signal.compositeScore)} className="mt-5" indicatorClassName={signal.action === "BUY" ? "bg-success" : signal.action === "SELL" ? "bg-risk" : "bg-warning"} />
            <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{signal.summary}</p>
            {signal.availability === "HALTED" && <div className="mt-4 flex items-start gap-2 rounded-md border border-risk/25 bg-risk/[0.06] p-3 text-xs leading-relaxed text-risk"><ShieldAlert className="mt-0.5 size-3.5 shrink-0" />This signal should not be treated as actionable until the evidence sources recover.</div>}
            <div className="mt-5 grid grid-cols-3 gap-2 border-t pt-4 text-center"><div><p className="numeric text-sm font-medium">{signal.confidencePct}%</p><p className="mt-1 text-[9px] tracking-wider text-muted-foreground uppercase">Confidence</p></div><div><p className="numeric text-sm font-medium">{signal.agreementPct}%</p><p className="mt-1 text-[9px] tracking-wider text-muted-foreground uppercase">Agreement</p></div><div><p className="numeric text-sm font-medium">{relativeTime(signal.evaluatedAt)}</p><p className="mt-1 text-[9px] tracking-wider text-muted-foreground uppercase">Evaluated</p></div></div>
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
function currencyValue(idrValue: string, usdValue: string | undefined, currency: "IDR" | "USD") { return currency === "USD" ? usdValue ? formatNativeMoney(usdValue, "USD") : "—" : formatNativeMoney(idrValue, "IDR"); }
function formatNetWorthValue(idrValue: string, idrPerUsd: string | undefined, currency: "IDR" | "USD") { if (currency === "IDR") return formatNativeMoney(idrValue, "IDR"); if (!idrPerUsd || !new Decimal(idrPerUsd).gt(0)) return "—"; return formatNativeMoney(new Decimal(idrValue).div(idrPerUsd).toString(), "USD"); }
function netWorthDisplayAmount(idrValue: string, idrPerUsd: string | undefined, currency: "IDR" | "USD") { if (currency === "IDR") return new Decimal(idrValue).toNumber(); if (!idrPerUsd || !new Decimal(idrPerUsd).gt(0)) return 0; return new Decimal(idrValue).div(idrPerUsd).toNumber(); }
function greeting() { const hour = new Date().getHours(); return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"; }
