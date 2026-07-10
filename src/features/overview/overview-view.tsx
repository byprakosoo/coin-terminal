"use client";

import Link from "next/link";
import Decimal from "decimal.js";
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
import { formatDecimal, formatMoney, formatPct, monthKey } from "@/lib/format";
import { cn, relativeTime } from "@/lib/utils";
import { useTerminalStore } from "@/store/terminal-store";

export function OverviewView() {
  const transactions = useTerminalStore((state) => state.transactions);
  const prices = useTerminalStore((state) => state.prices);
  const spending = useTerminalStore((state) => state.spending);
  const signal = useTerminalStore((state) => state.signals[0]);
  const event = useTerminalStore((state) => state.events[0]);
  const alerts = useTerminalStore((state) => state.alerts);
  const profile = useTerminalStore((state) => state.profile);
  const rates = useTerminalStore((state) => state.fxRates);
  const portfolio = calculatePortfolio(transactions, prices);
  const cashflow = calculateSpending(spending, monthKey(), rates);
  const topWarnings = alerts.filter((alert) => !alert.readAt || alert.severity !== "INFO").slice(0, 3);
  const currency = profile.displayCurrency;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Private command center" title={`Good ${greeting()}, ${profile.name.split(" ")[0]}`} description="One scan of your tracked finances, BTC research posture, and public-wallet risk signals." actions={<Badge variant="success"><span className="size-1.5 rounded-full bg-success" />Updated {relativeTime(prices[0].observedAt)}</Badge>} />

      {portfolio.incompleteBasis && <div className="flex flex-col gap-3 rounded-lg border border-warning/25 bg-warning/[0.045] p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /><div><p className="text-sm font-medium">Portfolio totals are provisional</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">An ETH reward is missing acquisition value. Quantity is included; cost basis and P&L are flagged incomplete.</p></div></div><Link href="/portfolio" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}>Review ledger<ArrowRight /></Link></div>}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Tracked value" value={formatMoney(portfolio.totalValueUsd, currency, rates)} trend={formatPct(portfolio.dailyChangePct, true)} trendDirection={new Decimal(portfolio.dailyChangePct).gte(0) ? "up" : "down"} detail="24h weighted" icon={<WalletCards />} />
        <MetricCard label="Unrealized P&L" value={formatMoney(portfolio.unrealizedPnlUsd, currency, rates)} trend={formatPct(new Decimal(portfolio.unrealizedPnlUsd).div(portfolio.totalCostBasisUsd || 1).mul(100).toString(), true)} trendDirection={new Decimal(portfolio.unrealizedPnlUsd).gte(0) ? "up" : "down"} detail="provisional" icon={<LineChart />} />
        <MetricCard label="Monthly expenses" value={formatMoney(cashflow.expensesUsd, currency, rates)} trend={formatPct(cashflow.expenseChangePct, true)} trendDirection={new Decimal(cashflow.expenseChangePct).lte(0) ? "up" : "down"} detail="vs last month" icon={<Landmark />} />
        <MetricCard label="Savings rate" value={formatPct(cashflow.savingsRatePct)} trend={formatMoney(cashflow.savingsUsd, currency, rates)} trendDirection="up" detail="retained this month" icon={<CircleDollarSign />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.8fr]">
        <Card>
          <CardHeader><SectionHeader title="Portfolio allocation" description="Calculated from your ledger and latest seeded market snapshot." meta={<Badge variant="info">Calculated</Badge>} /></CardHeader>
          <CardContent className="grid items-center gap-4 pt-2 md:grid-cols-[0.85fr_1.15fr]">
            <div className="relative"><AllocationChart holdings={portfolio.holdings} /><div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="text-center"><p className="numeric text-lg font-semibold">{portfolio.holdings.length}</p><p className="text-[9px] tracking-wider text-muted-foreground uppercase">Assets</p></div></div></div>
            <div className="space-y-1">
              {portfolio.holdings.map((holding, index) => <Link key={holding.assetSymbol} href="/portfolio" className="flex items-center justify-between rounded-md p-2.5 transition hover:bg-accent"><div className="flex items-center gap-3"><span className={cn("flex size-8 items-center justify-center rounded-full border font-mono text-[10px] font-bold", index === 0 ? "border-primary/30 bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>{holding.assetSymbol.slice(0, 2)}</span><div><p className="text-sm font-medium">{holding.assetSymbol}</p><p className="text-[11px] text-muted-foreground">{formatDecimal(holding.quantity)} {holding.assetSymbol}</p></div></div><div className="text-right"><p className="numeric text-sm font-medium">{formatMoney(holding.currentValueUsd, currency, rates)}</p><p className="numeric text-[11px] text-muted-foreground">{formatPct(holding.allocationPct)}</p></div></Link>)}
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-warning/20 bg-[linear-gradient(145deg,rgb(246_167_35/0.075),transparent_45%)]">
          <CardHeader><SectionHeader title="BTC daily research" description="Latest decision after the UTC daily candle." meta={<FreshnessBadge value={signal.freshness} />} /></CardHeader>
          <CardContent>
            <div className="flex items-end justify-between gap-4"><div><div className="flex items-center gap-2"><SignalBadge value={signal.action} /><span className="font-mono text-[10px] text-muted-foreground">{signal.ruleVersion}</span></div><p className="numeric mt-4 text-3xl font-semibold">{signal.compositeScore}<span className="text-sm font-normal text-muted-foreground"> / 100</span></p><p className="mt-1 text-xs text-muted-foreground">Composite score</p></div><div className="text-right"><p className="numeric text-xl font-semibold">{formatMoney(signal.priceUsd)}</p><p className="numeric mt-1 text-xs text-success">{formatPct(signal.change24hPct, true)} 24h</p></div></div>
            <Progress value={Number(signal.compositeScore)} className="mt-5" indicatorClassName="bg-warning" />
            <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{signal.summary}</p>
            <div className="mt-5 grid grid-cols-3 gap-2 border-t pt-4 text-center"><div><p className="numeric text-sm font-medium">{signal.confidencePct}%</p><p className="mt-1 text-[9px] tracking-wider text-muted-foreground uppercase">Confidence</p></div><div><p className="numeric text-sm font-medium">5 / 5</p><p className="mt-1 text-[9px] tracking-wider text-muted-foreground uppercase">Factors</p></div><div><p className="numeric text-sm font-medium">{relativeTime(signal.evaluatedAt)}</p><p className="mt-1 text-[9px] tracking-wider text-muted-foreground uppercase">Evaluated</p></div></div>
            <Link href="/btc-research" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "mt-5 w-full")}>Inspect evidence<ArrowRight /></Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className={cn(event.entryStatus === "EXTENDED" || event.entryStatus === "AVOID" ? "border-risk/30" : "")}>
          <CardHeader><SectionHeader title="Priority smart-money event" description="Observed qualified-wallet proxy activity, not verified institutional identity." meta={<EntryBadge value={event.entryStatus} />} /></CardHeader>
          <CardContent>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><span className="flex size-11 items-center justify-center rounded-xl border border-risk/25 bg-risk/10 font-mono text-sm font-bold text-risk">{event.tokenSymbol.slice(0, 3)}</span><div><p className="font-medium">{event.tokenName} <span className="text-muted-foreground">· {event.chain}</span></p><p className="mt-1 text-xs text-muted-foreground">{event.qualifiedWalletCount} qualified wallets · first seen {relativeTime(event.firstDetectedAt)}</p></div></div><div className="text-left sm:text-right"><p className="numeric text-xl font-semibold text-risk">{formatPct(event.priceChangePct, true)}</p><p className="text-[10px] tracking-wider text-muted-foreground uppercase">Since detection</p></div></div>
            <div className="mt-5 grid grid-cols-3 gap-3 border-y py-4"><SmallMetric label="Net observed buy" value={formatMoney(event.netBuyUsd, currency, rates, true)} /><SmallMetric label="Liquidity" value={formatMoney(event.liquidityUsd, currency, rates, true)} /><SmallMetric label="24h volume" value={formatMoney(event.volume24hUsd, currency, rates, true)} /></div>
            <div className="mt-4 flex items-start gap-2.5 text-xs leading-relaxed text-risk"><ShieldAlert className="mt-0.5 size-3.5 shrink-0" /><span>{event.riskFactors[0]}. Late-entry risk is visually prioritized over the observed buying.</span></div>
            <Link href={`/smart-money?event=${event.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-5")}>Open evidence trail<ArrowRight /></Link>
          </CardContent>
        </Card>

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
function greeting() { const hour = new Date().getHours(); return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"; }
