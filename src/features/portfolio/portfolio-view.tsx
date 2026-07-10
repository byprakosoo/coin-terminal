"use client";

import { useMemo, useState } from "react";
import Decimal from "decimal.js";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Download, Ellipsis, FileUp, Pencil, Plus, Search, Trash2, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { AllocationChart } from "@/components/charts";
import { ImportWizard } from "@/components/import-wizard";
import { MetricCard } from "@/components/metric-card";
import { PageHeader, SectionHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/api-client";
import { calculatePortfolio } from "@/lib/calculations";
import { formatDateTime, formatDecimal, formatMoney, formatPct } from "@/lib/format";
import type { PortfolioTransaction, TransactionType } from "@/lib/types";
import { useTerminalStore } from "@/store/terminal-store";

const types: TransactionType[] = ["BUY", "SELL", "TRANSFER_IN", "TRANSFER_OUT", "REWARD", "AIRDROP", "FEE"];

export function PortfolioView() {
  const transactions = useTerminalStore((state) => state.transactions);
  const prices = useTerminalStore((state) => state.prices);
  const profile = useTerminalStore((state) => state.profile);
  const rates = useTerminalStore((state) => state.fxRates);
  const deleteTransaction = useTerminalStore((state) => state.deleteTransaction);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<PortfolioTransaction | undefined>();
  const [deleting, setDeleting] = useState<PortfolioTransaction | undefined>();
  const summary = calculatePortfolio(transactions, prices);
  const filtered = transactions
    .filter((item) => typeFilter === "ALL" || item.transactionType === typeFilter)
    .filter((item) => `${item.assetSymbol} ${item.venue} ${item.note ?? ""}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());
  const currency = profile.displayCurrency;

  const exportCsv = () => {
    const anchor = document.createElement("a"); anchor.href = "/api/portfolio/export"; anchor.download = ""; anchor.click();
    toast.success("Portfolio CSV exported");
  };
  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteTransaction(deleting.id);
      toast.success("Transaction deleted");
      setDeleting(undefined);
    } catch (error) {
      toast.error("Transaction could not be deleted", { description: error instanceof Error ? error.message : undefined });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Ledger & cost basis" title="Portfolio" description="Record actual executions, inspect calculated balances, and keep incomplete cost basis visible." actions={<><Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><FileUp />Import CSV</Button><Button size="sm" onClick={() => { setEditing(undefined); setFormOpen(true); }}><Plus />Add transaction</Button></>} />
      {summary.incompleteBasis && <div className="flex gap-3 rounded-lg border border-warning/25 bg-warning/[0.045] p-4"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /><div><p className="text-sm font-medium">Incomplete cost basis</p><p className="mt-1 text-xs text-muted-foreground">At least one incoming transfer, reward, or airdrop has no acquisition price. Affected P&L remains provisional.</p></div></div>}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Current value" value={formatMoney(summary.totalValueUsd, currency, rates)} trend={formatPct(summary.dailyChangePct, true)} trendDirection={new Decimal(summary.dailyChangePct).gte(0) ? "up" : "down"} detail="24h weighted" />
        <MetricCard label="Cost basis" value={formatMoney(summary.totalCostBasisUsd, currency, rates)} detail={summary.incompleteBasis ? "incomplete" : "complete"} icon={<WalletCards />} />
        <MetricCard label="Unrealized P&L" value={formatMoney(summary.unrealizedPnlUsd, currency, rates)} trend={formatPct(new Decimal(summary.unrealizedPnlUsd).div(summary.totalCostBasisUsd || 1).mul(100).toString(), true)} trendDirection={new Decimal(summary.unrealizedPnlUsd).gte(0) ? "up" : "down"} />
        <MetricCard label="Realized P&L" value={formatMoney(summary.realizedPnlUsd, currency, rates)} trendDirection={new Decimal(summary.realizedPnlUsd).gte(0) ? "up" : "down"} detail="average-cost method" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.72fr_1.28fr]">
        <Card><CardHeader><SectionHeader title="Asset allocation" description="Latest market value by tracked asset." meta={<Badge variant="info">Calculated</Badge>} /></CardHeader><CardContent><div className="relative"><AllocationChart holdings={summary.holdings} /><div className="pointer-events-none absolute inset-0 flex items-center justify-center"><p className="numeric text-lg font-semibold">{summary.holdings.length}</p></div></div><div className="mt-1 space-y-1">{summary.holdings.map((holding, index) => <div key={holding.assetSymbol} className="flex items-center justify-between rounded-md px-2 py-2"><div className="flex items-center gap-2.5"><span className={`size-2 rounded-full ${["bg-primary", "bg-info", "bg-success", "bg-violet-400"][index % 4]}`} /><span className="text-xs font-medium">{holding.assetSymbol}</span>{holding.incompleteBasis && <Badge variant="warning">Basis gap</Badge>}</div><div className="text-right"><p className="numeric text-xs">{formatPct(holding.allocationPct)}</p><p className="numeric text-[10px] text-muted-foreground">{formatMoney(holding.currentValueUsd, currency, rates)}</p></div></div>)}</div></CardContent></Card>
        <Card><CardHeader><SectionHeader title="Holdings" description="Balances and P&L derived from the complete ledger." /></CardHeader><CardContent className="px-0"><Table><TableHeader><TableRow><TableHead className="pl-5">Asset</TableHead><TableHead>Quantity</TableHead><TableHead>Average cost</TableHead><TableHead>Price</TableHead><TableHead>Value</TableHead><TableHead>P&L</TableHead><TableHead className="pr-5 text-right">Allocation</TableHead></TableRow></TableHeader><TableBody>{summary.holdings.map((holding) => <TableRow key={holding.assetSymbol}><TableCell className="pl-5"><div className="flex items-center gap-2.5"><span className="flex size-8 items-center justify-center rounded-full border bg-secondary font-mono text-[10px] font-bold">{holding.assetSymbol.slice(0, 2)}</span><div><p className="font-medium">{holding.assetSymbol}</p><p className="text-[10px] text-muted-foreground">{holding.name}</p></div></div></TableCell><TableCell className="numeric">{formatDecimal(holding.quantity)}</TableCell><TableCell className="numeric">{formatMoney(holding.averageCostUsd, currency, rates)}</TableCell><TableCell><p className="numeric">{formatMoney(holding.currentPriceUsd, currency, rates)}</p><p className={`numeric text-[10px] ${Number(holding.dailyChangePct) >= 0 ? "text-success" : "text-risk"}`}>{formatPct(holding.dailyChangePct, true)} 24h</p></TableCell><TableCell className="numeric font-medium">{formatMoney(holding.currentValueUsd, currency, rates)}</TableCell><TableCell><p className={`numeric ${Number(holding.unrealizedPnlUsd) >= 0 ? "text-success" : "text-risk"}`}>{formatMoney(holding.unrealizedPnlUsd, currency, rates)}</p>{holding.incompleteBasis && <p className="mt-0.5 text-[9px] text-warning">PROVISIONAL</p>}</TableCell><TableCell className="numeric pr-5 text-right">{formatPct(holding.allocationPct)}</TableCell></TableRow>)}{!summary.holdings.length && <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">No holdings yet. Add a transaction to begin.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between"><SectionHeader title="Transaction ledger" description={`${filtered.length} of ${transactions.length} records shown.`} /><div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><div className="relative sm:w-56"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search asset or venue" className="pl-9" /></div><Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">All types</SelectItem>{types.map((type) => <SelectItem key={type} value={type}>{type.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select><Button variant="outline" size="icon" onClick={exportCsv} aria-label="Export transaction CSV"><Download /></Button></div></CardHeader>
        <CardContent className="px-0"><Table><TableHeader><TableRow><TableHead className="pl-5">Date</TableHead><TableHead>Type</TableHead><TableHead>Asset</TableHead><TableHead>Quantity</TableHead><TableHead>Execution price</TableHead><TableHead>Fee</TableHead><TableHead>Venue</TableHead><TableHead className="pr-5 text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{filtered.map((transaction) => <TableRow key={transaction.id}><TableCell className="pl-5 text-xs"><p>{formatDateTime(transaction.executedAt, profile.timezone)}</p>{transaction.note && <p className="mt-1 max-w-44 truncate text-[10px] text-muted-foreground">{transaction.note}</p>}</TableCell><TableCell><TransactionBadge type={transaction.transactionType} /></TableCell><TableCell className="font-medium">{transaction.assetSymbol}</TableCell><TableCell className="numeric">{formatDecimal(transaction.quantity)}</TableCell><TableCell className="numeric">{formatMoney(transaction.unitPriceUsd, currency, rates)}</TableCell><TableCell className="numeric text-muted-foreground">{formatMoney(transaction.feeUsd, currency, rates)}</TableCell><TableCell className="text-xs text-muted-foreground">{transaction.venue}</TableCell><TableCell className="pr-5 text-right"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Transaction actions"><Ellipsis /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => { setEditing(transaction); setFormOpen(true); }}><Pencil />Edit record</DropdownMenuItem><DropdownMenuItem destructive onSelect={() => setDeleting(transaction)}><Trash2 />Delete record</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}{!filtered.length && <TableRow><TableCell colSpan={8} className="h-28 text-center text-muted-foreground">No matching transactions.</TableCell></TableRow>}</TableBody></Table></CardContent>
      </Card>

      <TransactionDialog key={`${editing?.id ?? "new"}-${formOpen ? "open" : "closed"}`} open={formOpen} onOpenChange={setFormOpen} transaction={editing} />
      <ImportWizard open={importOpen} onOpenChange={setImportOpen} kind="portfolio" />
      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(undefined)}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Delete transaction?</DialogTitle><DialogDescription>This will recalculate every affected balance and P&L figure. The action cannot be undone.</DialogDescription></DialogHeader>{deleting && <div className="rounded-md border bg-background/50 p-3 text-sm"><span className="font-medium">{deleting.transactionType} {deleting.quantity} {deleting.assetSymbol}</span><span className="ml-2 text-muted-foreground">at {formatMoney(deleting.unitPriceUsd)}</span></div>}<DialogFooter><Button variant="ghost" onClick={() => setDeleting(undefined)}>Cancel</Button><Button variant="destructive" onClick={() => void confirmDelete()}><Trash2 />Delete</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function TransactionDialog({ open, onOpenChange, transaction }: { open: boolean; onOpenChange: (value: boolean) => void; transaction?: PortfolioTransaction }) {
  const add = useTerminalStore((state) => state.addTransaction);
  const update = useTerminalStore((state) => state.updateTransaction);
  const prices = useTerminalStore((state) => state.prices);
  const transactions = useTerminalStore((state) => state.transactions);
  const summary = useMemo(() => calculatePortfolio(transactions, prices), [prices, transactions]);
  const initialAsset = transaction?.assetSymbol ?? "BTC";
  const [asset, setAsset] = useState(initialAsset);
  const [type, setType] = useState<TransactionType>(transaction?.transactionType ?? "BUY");
  const [quantity, setQuantity] = useState(transaction?.quantity ?? "");
  const [price, setPrice] = useState(transaction?.unitPriceUsd ?? prices.find((item) => item.assetSymbol === initialAsset)?.priceUsd ?? "");
  const [fee, setFee] = useState(transaction?.feeUsd ?? "0");
  const [venue, setVenue] = useState(transaction?.venue ?? "Coinbase");
  const [date, setDate] = useState(toLocalInput(transaction?.executedAt ?? new Date().toISOString()));
  const [note, setNote] = useState(transaction?.note ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  const changeAsset = (value: string) => { setAsset(value); if (!transaction) setPrice(prices.find((item) => item.assetSymbol === value)?.priceUsd ?? ""); };
  const suggestPrice = async () => {
    if (!date) return;
    setSuggesting(true); setError("");
    try {
      const suggestion = await apiRequest<{ priceUsd: string }>(`/api/market/price-suggestion?asset=${encodeURIComponent(asset)}&at=${encodeURIComponent(new Date(date).toISOString())}`);
      setPrice(suggestion.priceUsd);
    } catch (suggestionError) {
      setError(suggestionError instanceof Error ? suggestionError.message : "No price suggestion is available.");
    } finally {
      setSuggesting(false);
    }
  };
  const save = async () => {
    const q = new Decimal(quantity || 0); const p = new Decimal(price || 0); const f = new Decimal(fee || 0);
    if (type !== "FEE" && q.lte(0)) { setError("Quantity must be greater than zero."); return; }
    if (p.lt(0) || f.lt(0)) { setError("Price and fee cannot be negative."); return; }
    if (!date || Number.isNaN(new Date(date).getTime())) { setError("Choose a valid execution date."); return; }
    const available = new Decimal(summary.holdings.find((item) => item.assetSymbol === asset)?.quantity ?? 0).add(transaction && transaction.assetSymbol === asset && ["SELL", "TRANSFER_OUT"].includes(transaction.transactionType) ? transaction.quantity : 0);
    if (["SELL", "TRANSFER_OUT"].includes(type) && q.gt(available)) { setError(`Only ${available.toString()} ${asset} is available.`); return; }
    const value: Omit<PortfolioTransaction, "id"> = { assetSymbol: asset, transactionType: type, quantity: type === "FEE" && !quantity ? "0" : q.toString(), unitPriceUsd: p.toString(), feeUsd: f.toString(), venue: venue.trim() || "Manual", executedAt: new Date(date).toISOString(), note: note.trim() || undefined, fingerprint: transaction?.fingerprint };
    setSaving(true); setError("");
    try {
      if (transaction) await update(transaction.id, value); else await add(value);
      toast.success(transaction ? "Transaction updated" : "Transaction added", { description: "Portfolio metrics were recalculated." }); onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The transaction could not be saved.");
      setSaving(false);
    }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{transaction ? "Edit transaction" : "Add portfolio transaction"}</DialogTitle><DialogDescription>Enter the actual execution details. Suggested market prices remain editable.</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><Field label="Asset"><Select value={asset} onValueChange={changeAsset}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[...new Set([...prices.map((item) => item.assetSymbol), "USDC"])].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></Field><Field label="Type"><Select value={type} onValueChange={(value) => setType(value as TransactionType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{types.map((item) => <SelectItem key={item} value={item}>{item.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select></Field><Field label="Quantity"><Input inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="0.00" /></Field><Field label="Unit price (USD)"><div className="flex gap-2"><Input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} /><Button type="button" variant="outline" onClick={() => void suggestPrice()} disabled={suggesting}>{suggesting ? "Loading…" : "Suggest"}</Button></div></Field><Field label="Fee (USD)"><Input inputMode="decimal" value={fee} onChange={(event) => setFee(event.target.value)} /></Field><Field label="Venue"><Input value={venue} onChange={(event) => setVenue(event.target.value)} /></Field><Field label="Executed at" className="sm:col-span-2"><Input type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)} /></Field><Field label="Note" className="sm:col-span-2"><Textarea className="min-h-20" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional context" /></Field></div>{error && <p className="flex items-center gap-2 rounded-md border border-destructive/25 bg-destructive/5 p-3 text-xs text-destructive"><AlertTriangle className="size-3.5" />{error}</p>}<DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button><Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : transaction ? "Save changes" : "Add transaction"}</Button></DialogFooter></DialogContent></Dialog>;
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) { return <div className={`space-y-2 ${className ?? ""}`}><Label>{label}</Label>{children}</div>; }
function TransactionBadge({ type }: { type: TransactionType }) { const variant = type === "BUY" || type === "TRANSFER_IN" || type === "REWARD" || type === "AIRDROP" ? "success" : type === "SELL" || type === "TRANSFER_OUT" ? "risk" : "neutral"; return <Badge variant={variant}>{type.includes("IN") || type === "BUY" || type === "REWARD" || type === "AIRDROP" ? <ArrowDownToLine /> : <ArrowUpFromLine />}{type.replaceAll("_", " ")}</Badge>; }
function toLocalInput(iso: string) { const date = new Date(iso); const offset = date.getTimezoneOffset() * 60_000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
