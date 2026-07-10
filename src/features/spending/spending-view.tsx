"use client";

import { useMemo, useState } from "react";
import Decimal from "decimal.js";
import { ArrowDownRight, ArrowUpRight, CalendarDays, CircleDollarSign, FileSpreadsheet, FileUp, Landmark, PiggyBank, Search, Tags } from "lucide-react";
import { SpendingTrendChart } from "@/components/charts";
import { ImportWizard } from "@/components/import-wizard";
import { MetricCard } from "@/components/metric-card";
import { PageHeader, SectionHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { calculateSpending } from "@/lib/calculations";
import { formatDate, formatMoney, formatNativeMoney, formatPct, monthKey } from "@/lib/format";
import { useTerminalStore } from "@/store/terminal-store";

export function SpendingView() {
  const spending = useTerminalStore((state) => state.spending);
  const batches = useTerminalStore((state) => state.importBatches);
  const profile = useTerminalStore((state) => state.profile);
  const rates = useTerminalStore((state) => state.fxRates);
  const [month, setMonth] = useState(monthKey());
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const summary = calculateSpending(spending, month, rates);
  const currency = profile.displayCurrency;
  const monthOptions = useMemo(() => Array.from(new Set(spending.map((item) => item.occurredOn.slice(0, 7)))).sort().reverse(), [spending]);
  const trendData = useMemo(() => [...monthOptions].reverse().slice(-6).map((key) => { const item = calculateSpending(spending, key, rates); return { month: new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }), income: Number(item.incomeUsd), expenses: Number(item.expensesUsd) }; }), [monthOptions, rates, spending]);
  const filtered = spending.filter((item) => item.occurredOn.startsWith(month)).filter((item) => `${item.category} ${item.account} ${item.note ?? ""}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));
  const maxCategory = Math.max(...summary.byCategory.map((item) => Number(item.amountUsd)), 1);
  const latestBatch = batches.find((batch) => batch.source === "MONEY_LOVER");

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Personal cash flow" title="Spending" description="Compare income and expenses, audit category totals, and review Money Lover imports before persistence." actions={<><Select value={month} onValueChange={setMonth}><SelectTrigger className="w-40"><CalendarDays className="size-3.5 text-muted-foreground" /><SelectValue /></SelectTrigger><SelectContent>{monthOptions.map((key) => <SelectItem key={key} value={key}>{new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</SelectItem>)}</SelectContent></Select><Button size="sm" onClick={() => setImportOpen(true)}><FileUp />Import Money Lover</Button></>} />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Income" value={formatMoney(summary.incomeUsd, currency, rates)} trend={formatMoney(summary.previousIncomeUsd, currency, rates)} trendDirection="up" detail="last month" icon={<ArrowUpRight />} />
        <MetricCard label="Expenses" value={formatMoney(summary.expensesUsd, currency, rates)} trend={formatPct(summary.expenseChangePct, true)} trendDirection={new Decimal(summary.expenseChangePct).lte(0) ? "up" : "down"} detail="vs last month" icon={<ArrowDownRight />} />
        <MetricCard label="Net savings" value={formatMoney(summary.savingsUsd, currency, rates)} trendDirection={new Decimal(summary.savingsUsd).gte(0) ? "up" : "down"} detail="income minus expenses" icon={<PiggyBank />} />
        <MetricCard label="Savings rate" value={formatPct(summary.savingsRatePct)} trendDirection={new Decimal(summary.savingsRatePct).gte(20) ? "up" : "neutral"} detail="of recorded income" icon={<CircleDollarSign />} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Card><CardHeader><SectionHeader title="Six-month cash-flow trend" description="Income and expenses from confirmed persisted records." meta={<div className="flex gap-3 text-[10px] text-muted-foreground"><span className="flex items-center gap-1.5"><i className="size-2 rounded-sm bg-success" />Income</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-sm bg-primary" />Expenses</span></div>} /></CardHeader><CardContent className="pl-2"><SpendingTrendChart data={trendData} /></CardContent></Card>
        <Card><CardHeader><SectionHeader title="Expense categories" description={`${summary.byCategory.length} categories this month.`} meta={<Tags className="size-4 text-muted-foreground" />} /></CardHeader><CardContent className="space-y-4">{summary.byCategory.map((item) => <div key={item.category}><div className="mb-1.5 flex items-center justify-between gap-3"><span className="text-xs font-medium">{item.category}</span><span className="numeric text-xs">{formatMoney(item.amountUsd, currency, rates)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${Number(item.amountUsd) / maxCategory * 100}%` }} /></div></div>)}{!summary.byCategory.length && <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">No expenses this month.</div>}</CardContent></Card>
      </div>
      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between"><SectionHeader title="Spending ledger" description={`${filtered.length} records in the selected period.`} meta={latestBatch && <Badge variant="info"><FileSpreadsheet />Last import: {latestBatch.acceptedRows} rows</Badge>} /><div className="relative w-full sm:w-64"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search category or account" /></div></CardHeader>
        <CardContent className="px-0"><Table><TableHeader><TableRow><TableHead className="pl-5">Date</TableHead><TableHead>Direction</TableHead><TableHead>Category</TableHead><TableHead>Account</TableHead><TableHead>Note</TableHead><TableHead className="pr-5 text-right">Amount</TableHead></TableRow></TableHeader><TableBody>{filtered.map((item) => <TableRow key={item.id}><TableCell className="pl-5 text-xs">{formatDate(`${item.occurredOn}T12:00:00Z`, profile.timezone)}</TableCell><TableCell><Badge variant={item.direction === "INCOME" ? "success" : "neutral"}>{item.direction === "INCOME" ? <ArrowUpRight /> : <ArrowDownRight />}{item.direction}</Badge></TableCell><TableCell className="font-medium">{item.category}</TableCell><TableCell className="text-xs text-muted-foreground">{item.account}</TableCell><TableCell className="max-w-64 truncate text-xs text-muted-foreground">{item.note || "—"}</TableCell><TableCell className={`numeric pr-5 text-right font-medium ${item.direction === "INCOME" ? "text-success" : ""}`}>{item.direction === "INCOME" ? "+" : "−"}{formatNativeMoney(item.amount, item.currency)}</TableCell></TableRow>)}{!filtered.length && <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No matching records for this month.</TableCell></TableRow>}</TableBody></Table></CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-3"><Info icon={Landmark} title="Normalized direction" description="Debit, credit, negative, income, and expense conventions are reviewed before import." /><Info icon={FileSpreadsheet} title="User-scoped duplicate check" description="Normalized rows receive a SHA-256 fingerprint; matching rows are skipped." /><Info icon={CircleDollarSign} title="Display conversion" description="Stored decimal values are rendered using the visible timestamped FX snapshot." /></div>
      <ImportWizard open={importOpen} onOpenChange={setImportOpen} kind="spending" />
    </div>
  );
}

function Info({ icon: Icon, title, description }: { icon: typeof Landmark; title: string; description: string }) { return <div className="flex gap-3 rounded-lg border bg-card p-4"><Icon className="mt-0.5 size-4 shrink-0 text-primary" /><div><p className="text-xs font-medium">{title}</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p></div></div>; }
