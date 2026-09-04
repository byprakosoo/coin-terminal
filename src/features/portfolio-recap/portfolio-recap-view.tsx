"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Decimal from "decimal.js";
import { Area, AreaChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArchiveRestore, ArrowDownToLine, CalendarDays, ChartNoAxesCombined, CircleDollarSign, Coins, Download, Pencil, Plus, ShieldAlert, Trash2, Upload, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { MetricCard } from "@/components/metric-card";
import { PageHeader, SectionHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatDate, formatDecimal, formatNativeMoney, formatPct } from "@/lib/format";
import { computeGoldSummary, computeSnapshotBreakdown, snapshotHistory } from "./recap-calc";
import type { GoldTransaction, GoldTransactionInput, GoldValuation, GoldValuationInput, PortfolioRecapSummary, PortfolioSnapshot, PortfolioSnapshotValues, SnapshotInput } from "./types";
import { RECAP_CATEGORIES } from "./types";
import { createWorkbookAnnualRows, createWorkbookGold, createWorkbookSnapshots } from "./workbook-preview-data";
import { usePortfolioRecap } from "./use-portfolio-recap";
import { useTerminalStore } from "@/store/terminal-store";

const TAB_VALUES = ["monthly", "gold", "annual", "backup"] as const;
export type RecapTab = (typeof TAB_VALUES)[number];
const colors = ["#8b9fff", "#65d5ad", "#f6a723", "#f06488", "#9c7cff", "#4fc3f7", "#f2c94c", "#c7a66a"];
const EMPTY_VALUES: PortfolioSnapshotValues = { bankIdr: "0", rdpuIdr: "0", ihsgIdr: "0", sp500Idr: "0", btcIdr: "0", ethIdr: "0", altcoinIdr: "0", goldIdr: "0" };
type GoldDeleteTarget =
  | { kind: "transaction"; record: GoldTransaction }
  | { kind: "valuation"; record: GoldValuation };

export function PortfolioRecapView({ embedded = false, forcedTab }: { embedded?: boolean; forcedTab?: RecapTab } = {}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = searchParams.get("tab");
  const tab: RecapTab = forcedTab ?? (TAB_VALUES.includes(requested as RecapTab) ? requested as RecapTab : "monthly");
  const recap = usePortfolioRecap();
  const [preview, setPreview] = useState<PortfolioRecapSummary>(() => createWorkbookPreviewRecap());
  const [snapshotEditor, setSnapshotEditor] = useState<PortfolioSnapshot>();
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [goldTransactionOpen, setGoldTransactionOpen] = useState(false);
  const [goldValuationOpen, setGoldValuationOpen] = useState(false);
  const [goldTransactionEditor, setGoldTransactionEditor] = useState<GoldTransaction>();
  const [goldValuationEditor, setGoldValuationEditor] = useState<GoldValuation>();
  const [goldDeleteTarget, setGoldDeleteTarget] = useState<GoldDeleteTarget>();
  const [goldDeleteOpen, setGoldDeleteOpen] = useState(false);
  const [goldDeleting, setGoldDeleting] = useState(false);
  const [annualOpen, setAnnualOpen] = useState(false);
  const data = recap.data ?? preview;
  const previewMode = !recap.data && !recap.loading && !recap.error;

  const setTab = (next: string) => {
    if (forcedTab) return;
    const params = new URLSearchParams(searchParams.toString());
    if (next === "monthly") params.delete("tab"); else params.set("tab", next);
    router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false });
  };
  const savePreviewSnapshot = (input: SnapshotInput, id?: string) => {
    setPreview((current) => {
      const timestamp = new Date().toISOString();
      const next: PortfolioSnapshot = { ...input, id: id ?? `preview-${crypto.randomUUID()}`, sequence: id ? current.snapshots.find((item) => item.id === id)?.sequence ?? current.snapshots.length + 1 : current.snapshots.length + 1, source: input.source ?? "MANUAL", createdAt: timestamp, updatedAt: timestamp };
      const snapshots = id ? current.snapshots.map((item) => item.id === id ? next : item) : [...current.snapshots, next];
      return withSummary({ ...current, snapshots });
    });
    toast.success(id ? "Snapshot updated in preview" : "Snapshot added in preview", { description: "Preview data resets when this page reloads." });
  };
  const deletePreviewSnapshot = (id: string) => {
    setPreview((current) => withSummary({ ...current, snapshots: current.snapshots.filter((item) => item.id !== id) }));
    toast.success("Preview snapshot removed");
  };
  const saveSnapshot = async (input: SnapshotInput, id?: string) => {
    if (previewMode) { savePreviewSnapshot(input, id); return true; }
    try { await recap.saveSnapshot(input, id); toast.success(id ? "Snapshot updated" : "Snapshot saved"); return true; }
    catch (error) { toast.error("Snapshot could not be saved", { description: error instanceof Error ? error.message : undefined }); return false; }
  };

  const savePreviewGoldTransaction = (input: GoldTransactionInput, id?: string) => {
    setPreview((current) => {
      const timestamp = new Date().toISOString();
      const existing = id ? current.gold.transactions.find((item) => item.id === id) : undefined;
      const next: GoldTransaction = {
        ...input,
        id: id ?? `preview-gold-${crypto.randomUUID()}`,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      const transactions = id
        ? current.gold.transactions.map((item) => (item.id === id ? next : item))
        : [...current.gold.transactions, next];
      return { ...current, gold: { ...current.gold, transactions, summary: computeGoldSummary(transactions, current.gold.valuations) } };
    });
    toast.success(id ? "Gold transaction updated in preview" : "Gold transaction added in preview", { description: "Preview data resets when this page reloads." });
  };

  const savePreviewGoldValuation = (input: GoldValuationInput, id?: string) => {
    setPreview((current) => {
      const timestamp = new Date().toISOString();
      const existing = id ? current.gold.valuations.find((item) => item.id === id) : undefined;
      const next: GoldValuation = {
        ...input,
        id: id ?? `preview-gold-valuation-${crypto.randomUUID()}`,
        source: input.source ?? "MANUAL",
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      const valuations = id
        ? current.gold.valuations.map((item) => (item.id === id ? next : item))
        : [...current.gold.valuations, next];
      return { ...current, gold: { ...current.gold, valuations, summary: computeGoldSummary(current.gold.transactions, valuations) } };
    });
    toast.success(id ? "Gold valuation updated in preview" : "Gold valuation added in preview", { description: "Preview data resets when this page reloads." });
  };

  const saveGoldTransaction = async (input: GoldTransactionInput, id?: string) => {
    if (previewMode) {
      savePreviewGoldTransaction(input, id);
      return true;
    }
    try {
      await recap.saveGoldTransaction(input, id);
      toast.success(id ? "Gold transaction updated" : "Gold transaction added");
      return true;
    } catch (error) {
      toast.error(id ? "Gold transaction could not be updated" : "Gold transaction could not be saved", { description: error instanceof Error ? error.message : undefined });
      return false;
    }
  };

  const saveGoldValuation = async (input: GoldValuationInput, id?: string) => {
    if (previewMode) {
      savePreviewGoldValuation(input, id);
      return true;
    }
    try {
      await recap.saveGoldValuation(input, id);
      toast.success(id ? "Gold valuation updated" : "Gold valuation added");
      return true;
    } catch (error) {
      toast.error(id ? "Gold valuation could not be updated" : "Gold valuation could not be saved", { description: error instanceof Error ? error.message : undefined });
      return false;
    }
  };

  const deletePreviewGold = (target: GoldDeleteTarget) => {
    setPreview((current) => {
      const transactions = target.kind === "transaction"
        ? current.gold.transactions.filter((item) => item.id !== target.record.id)
        : current.gold.transactions;
      const valuations = target.kind === "valuation"
        ? current.gold.valuations.filter((item) => item.id !== target.record.id)
        : current.gold.valuations;
      return { ...current, gold: { ...current.gold, transactions, valuations, summary: computeGoldSummary(transactions, valuations) } };
    });
    toast.success(`${target.kind === "transaction" ? "Gold transaction" : "Gold valuation"} removed from preview`, { description: "Preview data resets when this page reloads." });
  };

  const deleteGold = async () => {
    if (!goldDeleteTarget) return;
    setGoldDeleting(true);
    try {
      if (previewMode) {
        deletePreviewGold(goldDeleteTarget);
      } else if (goldDeleteTarget.kind === "transaction") {
        await recap.deleteGoldTransaction(goldDeleteTarget.record.id);
        toast.success("Gold transaction deleted");
      } else {
        await recap.deleteGoldValuation(goldDeleteTarget.record.id);
        toast.success("Gold valuation deleted");
      }
      setGoldDeleteOpen(false);
      setGoldDeleteTarget(undefined);
    } catch (error) {
      toast.error("Gold record could not be deleted", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setGoldDeleting(false);
    }
  };

  return <div className="space-y-6">
    {!embedded && <PageHeader eyebrow="Portfolio accounting" title="Portfolio" description="Your live ledger and your month-end financial history in one workspace." actions={<div className="flex items-center gap-2"><Badge variant={previewMode ? "warning" : "success"}><span className="size-1.5 rounded-full bg-current" />{previewMode ? "Frontend preview" : "Recap connected"}</Badge><Button variant="outline" size="sm" onClick={() => setTab("backup")}><ArchiveRestore />Backup</Button></div>} />}
    {previewMode && <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/[0.06] p-4 text-sm"><ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" /><div><p className="font-medium">Workbook preview data</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Values are loaded from Portofolio.xlsx while the recap API is pending. Any changes here are local to this browser tab and are not saved.</p></div></div>}
    {recap.error && <div className="rounded-lg border border-risk/30 bg-risk/[0.06] p-3 text-xs text-risk">Recap data could not refresh: {recap.error}</div>}
    <Tabs value={tab} onValueChange={setTab}>
      {!embedded && <TabsList className="h-auto max-w-full overflow-x-auto"><TabsTrigger value="monthly">Monthly recap</TabsTrigger><TabsTrigger value="gold">Gold</TabsTrigger><TabsTrigger value="annual">Annual recap</TabsTrigger><TabsTrigger value="backup">Backup</TabsTrigger></TabsList>}
      <TabsContent value="monthly"><MonthlyTab data={data} loading={recap.loading && !previewMode} onAdd={() => { setSnapshotEditor(undefined); setSnapshotOpen(true); }} onEdit={(item) => { setSnapshotEditor(item); setSnapshotOpen(true); }} onDelete={(item) => previewMode ? deletePreviewSnapshot(item.id) : void recap.deleteSnapshot(item.id).then(() => toast.success("Snapshot deleted")).catch(() => toast.error("Snapshot could not be deleted"))} /></TabsContent>
      <TabsContent value="gold"><GoldTab data={data} onTransaction={(record) => { setGoldTransactionEditor(record); setGoldTransactionOpen(true); }} onValuation={(record) => { setGoldValuationEditor(record); setGoldValuationOpen(true); }} onDelete={(target) => { setGoldDeleteTarget(target); setGoldDeleteOpen(true); }} /></TabsContent>
      <TabsContent value="annual"><AnnualTab data={data} onEdit={() => setAnnualOpen(true)} /></TabsContent>
      <TabsContent value="backup"><BackupTab templateAvailable={data.template.available} /></TabsContent>
    </Tabs>
    <SnapshotDialog key={`${snapshotEditor?.id ?? "new"}-${snapshotOpen ? "open" : "closed"}`} open={snapshotOpen} onOpenChange={setSnapshotOpen} snapshot={snapshotEditor} latest={data.snapshots.at(-1)} onSave={(input) => saveSnapshot(input, snapshotEditor?.id)} />
    <GoldDialog key={`gold-transaction-${goldTransactionEditor?.id ?? "new"}-${goldTransactionOpen ? "open" : "closed"}`} open={goldTransactionOpen} onOpenChange={(open) => { setGoldTransactionOpen(open); if (!open) setGoldTransactionEditor(undefined); }} kind="transaction" record={goldTransactionEditor} onSave={(input) => saveGoldTransaction(input, goldTransactionEditor?.id)} />
    <GoldDialog key={`gold-valuation-${goldValuationEditor?.id ?? "new"}-${goldValuationOpen ? "open" : "closed"}`} open={goldValuationOpen} onOpenChange={(open) => { setGoldValuationOpen(open); if (!open) setGoldValuationEditor(undefined); }} kind="valuation" record={goldValuationEditor} onSave={(input) => saveGoldValuation(input, goldValuationEditor?.id)} />
    <Dialog open={goldDeleteOpen} onOpenChange={(open) => !goldDeleting && setGoldDeleteOpen(open)}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Delete this {goldDeleteTarget?.kind === "valuation" ? "gold valuation" : "gold transaction"}?</DialogTitle><DialogDescription>{goldDeleteTarget?.kind === "valuation" ? "This permanently removes the dated price observation. Market value and unrealized P&L will recalculate from the remaining valuations." : "This permanently removes the gold lot. Holdings, cost basis, and P&L will recalculate; later sales must still remain valid."}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setGoldDeleteOpen(false)} disabled={goldDeleting}>Cancel</Button><Button variant="destructive" onClick={() => void deleteGold()} disabled={goldDeleting}>{goldDeleting ? "Deleting…" : "Delete record"}</Button></DialogFooter></DialogContent></Dialog>
    <AnnualDialog open={annualOpen} onOpenChange={setAnnualOpen} onSave={() => { setAnnualOpen(false); toast.success("Annual setting saved in preview"); }} />
  </div>;
}

function MonthlyTab({ data, loading, onAdd, onEdit, onDelete }: { data: PortfolioRecapSummary; loading: boolean; onAdd: () => void; onEdit: (snapshot: PortfolioSnapshot) => void; onDelete: (snapshot: PortfolioSnapshot) => void }) {
  const currency = useTerminalStore((state) => state.profile.displayCurrency);
  const latest = data.latestSummary;
  const sortedSnapshots = useMemo(() => [...data.snapshots].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate) || a.sequence - b.sequence), [data.snapshots]);
  const latestSnapshot = sortedSnapshots.at(-1);
  const displayMoney = (value: string, snapshot = latestSnapshot) => {
    if (currency === "IDR") return formatNativeMoney(value, "IDR");
    if (!snapshot?.idrPerUsd || !new Decimal(snapshot.idrPerUsd).gt(0)) return "—";
    return formatNativeMoney(new Decimal(value).div(snapshot.idrPerUsd).toString(), "USD");
  };
  const history = useMemo(() => snapshotHistory(sortedSnapshots).map((point, index) => ({ ...point, total: currency === "USD" ? (sortedSnapshots[index]?.idrPerUsd ? Number(new Decimal(point.total).div(sortedSnapshots[index]!.idrPerUsd!)) : Number.NaN) : point.total })), [currency, sortedSnapshots]);
  const allocation = latest ? RECAP_CATEGORIES.map((category, index) => ({ name: category.label, value: Number(latest.allocationPct[category.key]), color: colors[index] })).filter((item) => item.value > 0) : [];
  return <div className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-base font-semibold">Monthly allocation history</h2><p className="mt-1 text-sm text-muted-foreground">Frozen historical balances, displayed in the currency selected from the top bar.</p></div><Button size="sm" onClick={onAdd}><Plus />Add month-end snapshot</Button></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Net worth" value={latest ? displayMoney(latest.totalIdr) : "—"} detail={latest ? dateLabel(latest.asOfDate) : "No snapshot"} icon={<WalletCards />} /><MetricCard label="Month change" value={latest?.increaseIdr ? displayMoney(latest.increaseIdr) : "—"} trend={latest?.changePct ? formatPct(latest.changePct, true) : "First record"} trendDirection={Number(latest?.changePct ?? 0) >= 0 ? "up" : "down"} detail="Against prior snapshot" icon={<ChartNoAxesCombined />} /><MetricCard label="Crypto allocation" value={latest ? formatPct(new Decimal(latest.allocationPct.btcIdr).add(latest.allocationPct.ethIdr).add(latest.allocationPct.altcoinIdr).toString()) : "—"} detail="BTC, ETH & altcoins" icon={<Coins />} /><MetricCard label="Gold value" value={latest ? displayMoney(latest.goldIdr) : "—"} detail="Recorded month-end value" icon={<CircleDollarSign />} /></div>
    <div className="grid gap-4 xl:grid-cols-[1.35fr_0.85fr]"><ChartCard title="Net-worth history" description={`Monthly recorded value in ${currency}`}><RecapAreaChart data={history} currency={currency} /></ChartCard><ChartCard title="Latest allocation" description="8 fixed allocation categories"><RecapPie data={allocation} center={latest ? displayMoney(latest.totalIdr) : "No data"} total={Number(latest?.totalIdr ?? 0)} valuesArePercent formatNominal={(value) => displayMoney(String(value))} /></ChartCard></div>
    <div className="grid gap-4 lg:grid-cols-3"><GroupChart title="Asset classes" values={latest ? [{ name: "Liquid", value: Number(latest.liquidIdr), color: colors[0] }, { name: "Stocks", value: Number(latest.stocksIdr), color: colors[2] }, { name: "Crypto", value: Number(latest.cryptoIdr), color: colors[4] }, { name: "Gold", value: Number(latest.goldIdr), color: colors[7] }] : []} center={latest ? displayMoney(latest.totalIdr) : "No data"} total={Number(latest?.totalIdr ?? 0)} formatNominal={(value) => displayMoney(String(value))} /><GroupChart title="Crypto split" values={latest ? [{ name: "BTC", value: Number(latest.allocationPct.btcIdr), color: colors[4] }, { name: "ETH", value: Number(latest.allocationPct.ethIdr), color: colors[5] }, { name: "Altcoins", value: Number(latest.allocationPct.altcoinIdr), color: colors[6] }] : []} percentage total={Number(latest?.totalIdr ?? 0)} formatNominal={(value) => displayMoney(String(value))} /><GroupChart title="Stock split" values={latest ? [{ name: "IHSG", value: Number(latest.allocationPct.ihsgIdr), color: colors[2] }, { name: "S&P 500", value: Number(latest.allocationPct.sp500Idr), color: colors[3] }] : []} percentage total={Number(latest?.totalIdr ?? 0)} formatNominal={(value) => displayMoney(String(value))} /></div>
    <Card><CardHeader><SectionHeader title="Saved snapshots" description="Every saved snapshot keeps its full historical breakdown, along with net worth and monthly change." meta={<Badge variant="neutral">{data.snapshots.length} records</Badge>} /></CardHeader><CardContent className="pt-0">{loading ? <p className="py-12 text-center text-sm text-muted-foreground">Loading recap…</p> : <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Sequence</TableHead><TableHead>Net worth</TableHead><TableHead>Monthly change</TableHead>{RECAP_CATEGORIES.map((category) => <TableHead key={category.key}>{category.label}</TableHead>)}<TableHead>Source</TableHead><TableHead className="sticky right-0 z-20 border-l bg-card text-right shadow-[-8px_0_12px_-12px_rgb(0_0_0/0.8)]">Actions</TableHead></TableRow></TableHeader><TableBody>{[...data.snapshots].sort((a, b) => b.asOfDate.localeCompare(a.asOfDate) || b.sequence - a.sequence).map((item) => { const breakdown = computeSnapshotBreakdown(item, item.idrPerUsd); const previous = data.snapshots.filter((candidate) => candidate.asOfDate < item.asOfDate).sort((a, b) => b.asOfDate.localeCompare(a.asOfDate))[0]; const previousTotal = previous ? new Decimal(computeSnapshotBreakdown(previous).totalIdr) : undefined; const change = previousTotal ? new Decimal(breakdown.totalIdr).sub(previousTotal) : undefined; return <TableRow key={item.id}><TableCell><p className="text-xs font-medium">{dateLabel(item.asOfDate)}</p>{item.note && <p className="mt-0.5 max-w-48 truncate text-[10px] text-muted-foreground">{item.note}</p>}</TableCell><TableCell><Badge variant={item.sequence > 1 ? "warning" : "neutral"}>#{item.sequence}</Badge></TableCell><TableCell className="numeric text-xs font-medium">{displayMoney(breakdown.totalIdr, item)}</TableCell><TableCell className={cn("numeric text-xs", change?.lt(0) ? "text-risk" : "text-success")}>{change ? `${change.gte(0) ? "+" : ""}${displayMoney(change.toString(), item)}` : "—"}</TableCell>{RECAP_CATEGORIES.map((category) => <TableCell key={category.key} className="numeric text-xs">{displayMoney(item[category.key], item)}</TableCell>)}<TableCell><Badge variant="neutral">{item.source.replace("_", " ")}</Badge></TableCell><TableCell className="sticky right-0 z-10 border-l bg-card text-right shadow-[-8px_0_12px_-12px_rgb(0_0_0/0.8)]"><div className="inline-flex gap-1"><Button variant="ghost" size="icon-sm" onClick={() => onEdit(item)} aria-label="Edit snapshot"><Pencil /></Button><Button variant="ghost" size="sm" className="text-risk hover:text-risk" onClick={() => onDelete(item)}>Delete</Button></div></TableCell></TableRow>; })}</TableBody></Table>}</CardContent></Card>
  </div>;
}

function GoldTab({ data, onTransaction, onValuation, onDelete }: { data: PortfolioRecapSummary; onTransaction: (record?: GoldTransaction) => void; onValuation: (record?: GoldValuation) => void; onDelete: (target: GoldDeleteTarget) => void }) {
  const summary = data.gold.summary;
  const transactions = useMemo(
    () => [...data.gold.transactions].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)),
    [data.gold.transactions],
  );
  const valuations = useMemo(
    () => [...data.gold.valuations].sort((a, b) => b.asOfDate.localeCompare(a.asOfDate) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)),
    [data.gold.valuations],
  );

  return <div className="space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-base font-semibold">Gold record</h2><p className="mt-1 text-sm text-muted-foreground">Track physical-gold lots, cost basis, and dated manual valuations.</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => onValuation()}><CalendarDays />Add valuation</Button><Button size="sm" onClick={() => onTransaction()}><Plus />Add transaction</Button></div></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Held gold" value={`${formatDecimal(summary.heldGrams, 2)} g`} detail={`${formatDecimal(summary.soldGrams, 2)} g sold`} icon={<Coins />} /><MetricCard label="Market value" value={summary.marketValueIdr ? formatNativeMoney(summary.marketValueIdr, "IDR") : "No valuation"} detail={summary.valuationDate ? `As of ${dateLabel(summary.valuationDate)}` : "Add a valuation"} icon={<CircleDollarSign />} /><MetricCard label="Cost basis" value={formatNativeMoney(summary.remainingCostBasisIdr, "IDR")} detail={`${formatNativeMoney(summary.averageCostPerGramIdr, "IDR")} / g`} icon={<WalletCards />} /><MetricCard label="Unrealized P&L" value={summary.unrealizedPnlIdr ? formatNativeMoney(summary.unrealizedPnlIdr, "IDR") : "—"} trend={summary.unrealizedPnlPct ? formatPct(summary.unrealizedPnlPct, true) : "Awaiting valuation"} trendDirection={Number(summary.unrealizedPnlIdr ?? 0) >= 0 ? "up" : "down"} detail="At latest valuation" icon={<ChartNoAxesCombined />} /></div><GoldTable title="Transactions" description="Purchases and sales retain their original lot details." rows={transactions} onEdit={onTransaction} onDelete={(record) => onDelete({ kind: "transaction", record })} /><GoldValuationTable rows={valuations} onEdit={onValuation} onDelete={(record) => onDelete({ kind: "valuation", record })} /></div>;
}
function AnnualTab({ data, onEdit }: { data: PortfolioRecapSummary; onEdit: () => void }) { const rows = [...data.annual.rows].sort((a, b) => b.year - a.year); const averageYoy = rows.filter((row) => row.yoyPct).reduce((total, row, _, all) => total.add(row.yoyPct ?? 0).div(all.length || 1), new Decimal(0)); return <div className="space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-base font-semibold">Annual recap</h2><p className="mt-1 text-sm text-muted-foreground">Year-end net worth, YoY movement, and salary context for your long-term record.</p></div><Button size="sm" onClick={onEdit}><Pencil />Edit annual settings</Button></div><div className="grid gap-3 sm:grid-cols-3"><MetricCard label="CAGR" value={data.annual.cagrPct ? formatPct(data.annual.cagrPct) : "—"} detail="First to latest closing record" icon={<ChartNoAxesCombined />} /><MetricCard label="Average YoY" value={rows.length ? formatPct(averageYoy.toString()) : "—"} detail="Years with a comparison" icon={<CircleDollarSign />} /><MetricCard label="Years recorded" value={String(rows.length)} detail="Current year may be partial" icon={<CalendarDays />} /></div><Card><CardHeader><SectionHeader title="Annual performance" description="Net worth comes from the selected closing snapshot; salary is editable context." /></CardHeader><CardContent className="pt-0"><Table><TableHeader><TableRow><TableHead>Year</TableHead><TableHead>Closing date</TableHead><TableHead>Net worth</TableHead><TableHead>Gain / loss</TableHead><TableHead>YoY</TableHead><TableHead>Monthly salary</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.year}><TableCell><span className="font-medium">{row.year}</span>{row.isPartialYear && <Badge variant="warning" className="ml-2">Partial</Badge>}</TableCell><TableCell className="text-xs text-muted-foreground">{row.closingDate ? dateLabel(row.closingDate) : "Not selected"}</TableCell><TableCell className="numeric text-xs font-medium">{formatNativeMoney(row.netWorthIdr, "IDR")}</TableCell><TableCell className={cn("numeric text-xs", Number(row.gainLossIdr ?? 0) >= 0 ? "text-success" : "text-risk")}>{row.gainLossIdr ? formatNativeMoney(row.gainLossIdr, "IDR") : "—"}</TableCell><TableCell className="numeric text-xs">{row.yoyPct ? formatPct(row.yoyPct, true) : "—"}</TableCell><TableCell className="numeric text-xs">{row.monthlySalaryIdr ? formatNativeMoney(row.monthlySalaryIdr, "IDR") : "—"}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></div>; }
function BackupTab({ templateAvailable }: { templateAvailable: boolean }) { const [file, setFile] = useState<File>(); return <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]"><Card><CardHeader><SectionHeader title="Import existing workbook" description="Import uses a staged preview. It never overwrites records until conflicts are reviewed and confirmed." /></CardHeader><CardContent><label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-muted-foreground/35 bg-muted/20 px-6 py-12 text-center transition hover:border-primary/50 hover:bg-primary/[0.035]"><Upload className="size-6 text-primary" /><p className="mt-3 text-sm font-medium">Choose Portofolio.xlsx</p><p className="mt-1 text-xs text-muted-foreground">XLSX only · parsed in a staged import workflow</p><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(event) => setFile(event.target.files?.[0])} /></label>{file && <div className="mt-4 flex items-center justify-between rounded-md border p-3 text-xs"><div><p className="font-medium">{file.name}</p><p className="mt-1 text-muted-foreground">{formatDecimal(String(file.size / 1024), 1)} KB · ready for API upload</p></div><Badge variant="warning">Backend required</Badge></div>}<Button className="mt-4 w-full" disabled={!file} onClick={() => toast.info("Import staging is ready", { description: "Connect the workbook upload API to parse, preview conflicts, and confirm this file." })}>Create import preview<ArrowDownToLine /></Button></CardContent></Card><div className="space-y-4"><Card><CardHeader><SectionHeader title="Export backup" description="Exports the same Income History, Overview, Gold, and Annual Recap workbook structure." /></CardHeader><CardContent><div className="rounded-md border bg-muted/20 p-3 text-xs"><p className="font-medium">{templateAvailable ? "Active workbook template" : "Workbook template pending"}</p><p className="mt-1 text-muted-foreground">{templateAvailable ? "Formatting and chart layout will be preserved." : "Upload the canonical Portofolio.xlsx template when implementing the backend."}</p></div><Button variant="outline" className="mt-4 w-full" onClick={() => toast.info("Export endpoint required", { description: "The UI is ready for GET /api/portfolio-recap/export." })}><Download />Download spreadsheet backup</Button></CardContent></Card><Card><CardHeader><SectionHeader title="Safe import sequence" /></CardHeader><CardContent className="space-y-3 text-xs text-muted-foreground"><p><span className="mr-2 font-mono text-primary">01</span>Upload and validate the XLSX file.</p><p><span className="mr-2 font-mono text-primary">02</span>Preview accepted rows, duplicates, and conflicts.</p><p><span className="mr-2 font-mono text-primary">03</span>Choose a resolution for every conflict.</p><p><span className="mr-2 font-mono text-primary">04</span>Confirm the batch; then download a matching backup.</p></CardContent></Card></div></div>; }

type SnapshotEntryCurrency = "IDR" | "USD";

function SnapshotDialog({ open, onOpenChange, snapshot, latest, onSave }: { open: boolean; onOpenChange: (value: boolean) => void; snapshot?: PortfolioSnapshot; latest?: PortfolioSnapshot; onSave: (input: SnapshotInput) => Promise<boolean> }) {
  const [form, setForm] = useState<SnapshotInput>(() => snapshotToInput(snapshot ?? latest));
  const [currency, setCurrency] = useState<SnapshotEntryCurrency>("IDR");
  const [error, setError] = useState("");
  const snapshotId = snapshot?.id;
  const reset = (value: boolean) => {
    if (value) {
      setForm(snapshotToInput(snapshot ?? latest));
      setCurrency("IDR");
      setError("");
    }
    onOpenChange(value);
  };
  const sameMonth = latest && form.asOfDate.slice(0, 7) === latest.asOfDate.slice(0, 7) && !snapshotId;
  const changeCurrency = (next: SnapshotEntryCurrency) => {
    if (next === currency) return;
    const hasAmounts = RECAP_CATEGORIES.some((category) => new Decimal(form[category.key] || 0).gt(0));
    const rate = new Decimal(form.idrPerUsd || 0);
    if (hasAmounts && !rate.gt(0)) {
      setError("Enter a valid IDR-per-USD rate before converting existing amounts.");
      return;
    }
    if (hasAmounts) {
      const factor = currency === "IDR" ? new Decimal(1).div(rate) : rate;
      setForm((current) => ({
        ...current,
        ...Object.fromEntries(RECAP_CATEGORIES.map((category) => [category.key, new Decimal(current[category.key] || 0).mul(factor).toString()])),
      }) as SnapshotInput);
    }
    setCurrency(next);
    setError("");
  };
  const submit = async () => {
    const invalid = RECAP_CATEGORIES.some((category) => new Decimal(form[category.key] || 0).lt(0));
    const rate = new Decimal(form.idrPerUsd || 0);
    if (!form.asOfDate || invalid) {
      setError("Choose a date and use zero or positive numeric amounts.");
      return;
    }
    if (!rate.gt(0)) {
      setError("A positive IDR-per-USD rate is required so this snapshot can be converted later.");
      return;
    }
    const saved = currency === "USD"
      ? ({ ...form, ...Object.fromEntries(RECAP_CATEGORIES.map((category) => [category.key, new Decimal(form[category.key] || 0).mul(rate).toString()])) } as SnapshotInput)
      : form;
    if (await onSave(saved)) reset(false);
  };
  return <Dialog open={open} onOpenChange={reset}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{snapshotId ? "Edit snapshot" : "Add month-end snapshot"}</DialogTitle><DialogDescription>Select the entry currency. Historical balances are stored in IDR, with the recorded exchange rate enabling later USD conversion.</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-3"><Field label="As-of date"><Input type="date" value={form.asOfDate} onChange={(event) => setForm({ ...form, asOfDate: event.target.value })} /></Field><Field label="Entry currency"><Select value={currency} onValueChange={(value) => changeCurrency(value as SnapshotEntryCurrency)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="IDR">IDR</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent></Select></Field><Field label="IDR per USD (required)"><Input inputMode="decimal" placeholder="e.g. 16,250" value={form.idrPerUsd ?? ""} onChange={(event) => setForm({ ...form, idrPerUsd: digits(event.target.value) || undefined })} /></Field></div>{sameMonth && <div className="rounded-md border border-warning/30 bg-warning/[0.06] p-3 text-xs text-warning">A snapshot already exists this month. Saving this record will create sequence #{(latest?.sequence ?? 0) + 1}; it will not replace the earlier month-end record.</div>}<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{RECAP_CATEGORIES.map((category) => <Field key={category.key} label={`${category.label} (${currency})`}><Input inputMode="decimal" value={form[category.key]} onChange={(event) => setForm({ ...form, [category.key]: digits(event.target.value) })} /></Field>)}</div><Field label="Note (optional)"><Textarea className="min-h-16" value={form.note ?? ""} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Month-end notes, manual adjustment, or source context" /></Field>{error && <p className="text-xs text-risk">{error}</p>}<DialogFooter><Button variant="outline" onClick={() => reset(false)}>Cancel</Button><Button onClick={() => { void submit(); }}>Save snapshot</Button></DialogFooter></DialogContent></Dialog>;
}
type GoldDialogProps =
  | { open: boolean; onOpenChange: (value: boolean) => void; kind: "transaction"; record?: GoldTransaction; onSave: (input: GoldTransactionInput) => Promise<boolean> }
  | { open: boolean; onOpenChange: (value: boolean) => void; kind: "valuation"; record?: GoldValuation; onSave: (input: GoldValuationInput) => Promise<boolean> };

function GoldDialog(props: GoldDialogProps) {
  const transactionRecord = props.kind === "transaction" ? props.record : undefined;
  const valuationRecord = props.kind === "valuation" ? props.record : undefined;
  const isTransaction = props.kind === "transaction";
  const [transactionType, setTransactionType] = useState<"BUY" | "SELL">(transactionRecord?.transactionType ?? "BUY");
  const [date, setDate] = useState(transactionRecord?.occurredOn ?? valuationRecord?.asOfDate ?? today());
  const [goldType, setGoldType] = useState(transactionRecord?.goldType ?? "");
  const [grams, setGrams] = useState(transactionRecord ? cleanDecimal(transactionRecord.grams) : "");
  const [price, setPrice] = useState(transactionRecord ? cleanDecimal(transactionRecord.unitPriceIdr) : valuationRecord ? cleanDecimal(valuationRecord.pricePerGramIdr) : "");
  const [venue, setVenue] = useState(transactionRecord?.venue ?? "");
  const [note, setNote] = useState(transactionRecord?.note ?? valuationRecord?.note ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const reset = () => { setTransactionType("BUY"); setDate(today()); setGoldType(""); setGrams(""); setPrice(""); setVenue(""); setNote(""); setError(""); setSaving(false); };
  const submit = async () => {
    if (!date || !price || (isTransaction && (!goldType.trim() || !grams))) { setError("Complete all required fields."); return; }
    setSaving(true); setError("");
    let saved: boolean;
    if (props.kind === "transaction") {
      const input: GoldTransactionInput = { transactionType, occurredOn: date, goldType: goldType.trim(), grams, unitPriceIdr: price, venue: venue.trim() || undefined, note: note.trim() || undefined };
      saved = await props.onSave(input);
    } else {
      const input: GoldValuationInput = { asOfDate: date, pricePerGramIdr: price, source: valuationRecord?.source, note: note.trim() || undefined };
      saved = await props.onSave(input);
    }
    if (saved) { props.onOpenChange(false); reset(); } else setSaving(false);
  };
  return <Dialog open={props.open} onOpenChange={(next) => { if (!next) reset(); props.onOpenChange(next); }}><DialogContent><DialogHeader><DialogTitle>{isTransaction ? transactionRecord ? "Edit gold transaction" : "Add gold transaction" : valuationRecord ? "Edit gold valuation" : "Add gold valuation"}</DialogTitle><DialogDescription>{isTransaction ? "Record a buy or sell lot in IDR." : "Record a dated price per gram for valuation."}</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2">{isTransaction ? <><Field label="Transaction type"><Select value={transactionType} onValueChange={(value) => setTransactionType(value as "BUY" | "SELL")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="BUY">BUY</SelectItem><SelectItem value="SELL">SELL</SelectItem></SelectContent></Select></Field><Field label="Date"><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field><Field label="Gold type"><Input value={goldType} onChange={(event) => setGoldType(event.target.value)} placeholder="e.g. Antam 24K" /></Field><Field label="Grams"><Input inputMode="decimal" value={grams} onChange={(event) => setGrams(digits(event.target.value))} placeholder="0.00" /></Field><Field label="Unit price (IDR)"><Input inputMode="decimal" value={price} onChange={(event) => setPrice(digits(event.target.value))} placeholder="0" /></Field><Field label="Venue"><Input value={venue} onChange={(event) => setVenue(event.target.value)} placeholder="Optional" /></Field><div className="sm:col-span-2"><Field label="Note (optional)"><Textarea className="min-h-16" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional context" /></Field></div></> : <><Field label="Valuation date"><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field><Field label="Price per gram (IDR)"><Input inputMode="decimal" value={price} onChange={(event) => setPrice(digits(event.target.value))} placeholder="0" /></Field><div className="sm:col-span-2"><Field label="Note (optional)"><Textarea className="min-h-16" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional context" /></Field></div></>}</div>{error && <p className="text-xs text-risk">{error}</p>}<DialogFooter><Button variant="outline" onClick={() => props.onOpenChange(false)}>Cancel</Button><Button disabled={saving} onClick={() => void submit()}>{saving ? "Saving…" : `Save ${isTransaction ? transactionRecord ? "changes" : "transaction" : valuationRecord ? "changes" : "valuation"}`}</Button></DialogFooter></DialogContent></Dialog>;
}
function AnnualDialog({ open, onOpenChange, onSave }: { open: boolean; onOpenChange: (value: boolean) => void; onSave: () => void }) { return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Annual recap settings</DialogTitle><DialogDescription>Associate the year with a closing snapshot and optional monthly salary context.</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><Field label="Year"><Input defaultValue={String(new Date().getFullYear())} /></Field><Field label="Monthly salary (IDR)"><Input inputMode="decimal" placeholder="Optional" /></Field><Field label="Closing snapshot"><Input placeholder="Select after backend integration" disabled /></Field></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={onSave}>Save setting</Button></DialogFooter></DialogContent></Dialog>; }
function GoldTable({ title, description, rows, onEdit, onDelete }: { title: string; description: string; rows: GoldTransaction[]; onEdit: (record: GoldTransaction) => void; onDelete: (record: GoldTransaction) => void }) { return <Card><CardHeader><SectionHeader title={title} description={description} meta={<Badge variant="neutral">{rows.length} records</Badge>} /></CardHeader><CardContent className="pt-0"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Gold</TableHead><TableHead>Grams</TableHead><TableHead>Unit price</TableHead><TableHead>Venue</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell className="text-xs">{dateLabel(row.occurredOn)}</TableCell><TableCell><Badge variant={row.transactionType === "BUY" ? "success" : "warning"}>{row.transactionType}</Badge></TableCell><TableCell className="text-xs font-medium">{row.goldType}</TableCell><TableCell className="numeric text-xs">{formatDecimal(row.grams, 2)} g</TableCell><TableCell className="numeric text-xs">{formatNativeMoney(row.unitPriceIdr, "IDR")}</TableCell><TableCell className="text-xs text-muted-foreground">{row.venue ?? "—"}</TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon-sm" aria-label={`Edit ${row.goldType} transaction`} onClick={() => onEdit(row)}><Pencil /></Button><Button variant="ghost" size="icon-sm" className="text-risk hover:text-risk" aria-label={`Delete ${row.goldType} transaction`} onClick={() => onDelete(row)}><Trash2 /></Button></div></TableCell></TableRow>)}{!rows.length && <TableRow><TableCell colSpan={7} className="h-24 text-center text-xs text-muted-foreground">No gold transactions recorded.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>; }
function GoldValuationTable({ rows, onEdit, onDelete }: { rows: GoldValuation[]; onEdit: (record: GoldValuation) => void; onDelete: (record: GoldValuation) => void }) { return <Card><CardHeader><SectionHeader title="Valuation history" description="Manual price-per-gram observations used for the latest market-value calculation." meta={<Badge variant="neutral">{rows.length} records</Badge>} /></CardHeader><CardContent className="pt-0"><Table><TableHeader><TableRow><TableHead>As of</TableHead><TableHead>Price per gram</TableHead><TableHead>Source</TableHead><TableHead>Note</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell className="text-xs">{dateLabel(row.asOfDate)}</TableCell><TableCell className="numeric text-xs font-medium">{formatNativeMoney(row.pricePerGramIdr, "IDR")}</TableCell><TableCell><Badge variant="neutral">{row.source}</Badge></TableCell><TableCell className="max-w-72 truncate text-xs text-muted-foreground">{row.note ?? "—"}</TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon-sm" aria-label="Edit gold valuation" onClick={() => onEdit(row)}><Pencil /></Button><Button variant="ghost" size="icon-sm" className="text-risk hover:text-risk" aria-label="Delete gold valuation" onClick={() => onDelete(row)}><Trash2 /></Button></div></TableCell></TableRow>)}{!rows.length && <TableRow><TableCell colSpan={5} className="h-24 text-center text-xs text-muted-foreground">No gold valuations recorded.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>; }
function ChartCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <Card><CardHeader><SectionHeader title={title} description={description} /></CardHeader><CardContent className="h-72 pt-0">{children}</CardContent></Card>; }
function RecapAreaChart({ data, currency }: { data: ReturnType<typeof snapshotHistory>; currency: SnapshotEntryCurrency }) { if (!data.length) return <EmptyChart />; return <ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}><defs><linearGradient id="recapTotal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b9fff" stopOpacity={0.42} /><stop offset="100%" stopColor="#8b9fff" stopOpacity={0} /></linearGradient></defs><XAxis dataKey="date" tickFormatter={(value) => value.slice(0, 7)} tick={{ fontSize: 10, fill: "#7e8798" }} axisLine={false} tickLine={false} /><YAxis tickFormatter={(value) => currency === "USD" ? `$${Math.round(value / 1_000)}k` : `${Math.round(value / 1_000_000)}m`} tick={{ fontSize: 10, fill: "#7e8798" }} axisLine={false} tickLine={false} width={42} /><Tooltip formatter={(value, name) => { const amount = Number(value); return [Number.isFinite(amount) ? formatNativeMoney(amount, currency) : "—", name]; }} labelFormatter={(label) => dateLabel(String(label))} contentStyle={{ background: "#10151d", border: "1px solid #2b3340", borderRadius: 8, fontSize: 12 }} /><Area type="monotone" dataKey="total" name="Net worth" stroke="#8b9fff" strokeWidth={2} fill="url(#recapTotal)" /></AreaChart></ResponsiveContainer>; }
function RecapPie({ data, center, total = 0, valuesArePercent = false, formatNominal = (value: number) => formatNativeMoney(value, "IDR") }: { data: Array<{ name: string; value: number; color: string }>; center: string; total?: number; valuesArePercent?: boolean; formatNominal?: (value: number) => string }) { if (!data.length) return <EmptyChart />; return <div className="relative h-full"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={2}>{data.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip formatter={(value, name) => { const amount = Number(value); const nominal = valuesArePercent ? total * amount / 100 : amount; const percentage = valuesArePercent ? amount : total > 0 ? amount / total * 100 : 0; return [`${formatPct(percentage)} · ${formatNominal(nominal)}`, name]; }} contentStyle={{ background: "#10151d", border: "1px solid #2b3340", borderRadius: 8, fontSize: 12 }} /><Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} /></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 flex items-center justify-center"><p className="numeric max-w-28 text-center text-xs font-semibold">{center}</p></div></div>; }
function GroupChart({ title, values, percentage = false, center, total, formatNominal }: { title: string; values: Array<{ name: string; value: number; color: string }>; percentage?: boolean; center?: string; total?: number; formatNominal?: (value: number) => string }) { return <ChartCard title={title} description={percentage ? "Share of total net worth" : "Value at latest snapshot"}><RecapPie data={values} center={percentage ? "Allocation" : center ?? (values.length ? formatNativeMoney(values.reduce((total, item) => total + item.value, 0), "IDR") : "No data")} total={total} valuesArePercent={percentage} formatNominal={formatNominal} /></ChartCard>; }
function EmptyChart() { return <div className="flex h-full items-center justify-center text-center text-xs text-muted-foreground">Add a snapshot to begin building this chart.</div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
function digits(value: string) { return value.replace(/[^0-9.]/g, ""); }
function today() { return new Date().toISOString().slice(0, 10); }
function dateLabel(value: string) { return formatDate(`${value}T12:00:00Z`, "UTC"); }
function snapshotToInput(snapshot?: PortfolioSnapshot): SnapshotInput { return snapshot ? { asOfDate: snapshot.asOfDate, bankIdr: cleanDecimal(snapshot.bankIdr), rdpuIdr: cleanDecimal(snapshot.rdpuIdr), ihsgIdr: cleanDecimal(snapshot.ihsgIdr), sp500Idr: cleanDecimal(snapshot.sp500Idr), btcIdr: cleanDecimal(snapshot.btcIdr), ethIdr: cleanDecimal(snapshot.ethIdr), altcoinIdr: cleanDecimal(snapshot.altcoinIdr), goldIdr: cleanDecimal(snapshot.goldIdr), idrPerUsd: snapshot.idrPerUsd ? cleanDecimal(snapshot.idrPerUsd) : undefined, note: snapshot.note, source: snapshot.source } : { asOfDate: today(), ...EMPTY_VALUES, source: "MANUAL" }; }
function cleanDecimal(value: string) { return new Decimal(value || 0).toFixed().replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); }
function withSummary(data: PortfolioRecapSummary): PortfolioRecapSummary { const sorted = [...data.snapshots].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate) || a.sequence - b.sequence); const latest = sorted.at(-1); if (!latest) return { ...data, latestSummary: undefined }; const breakdown = computeSnapshotBreakdown(latest, latest.idrPerUsd); const previous = sorted.at(-2); const previousTotal = previous ? new Decimal(computeSnapshotBreakdown(previous).totalIdr) : undefined; const increase = previousTotal ? new Decimal(breakdown.totalIdr).sub(previousTotal) : undefined; return { ...data, latestSummary: { asOfDate: latest.asOfDate, sequence: latest.sequence, liquidIdr: breakdown.liquidIdr, stocksIdr: breakdown.stocksIdr, cryptoIdr: breakdown.cryptoIdr, goldIdr: breakdown.goldIdr, totalIdr: breakdown.totalIdr, totalUsd: breakdown.totalUsd, increaseIdr: increase?.toString(), changePct: increase && previousTotal?.gt(0) ? increase.div(previousTotal).mul(100).toString() : undefined, allocationPct: breakdown.allocationPct } }; }
function createWorkbookPreviewRecap(): PortfolioRecapSummary { const gold = createWorkbookGold(); return withSummary({ snapshots: createWorkbookSnapshots(), gold, annual: { settings: [], rows: createWorkbookAnnualRows(), cagrPct: "27.452347" }, template: { available: true, filename: "Portofolio.xlsx" } }); }
