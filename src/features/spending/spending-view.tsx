"use client";

import { useMemo, useState } from "react";
import Decimal from "decimal.js";
import { ArrowDownRight, ArrowUpRight, CalendarDays, CircleDollarSign, FileSpreadsheet, FileUp, Landmark, Pencil, PiggyBank, Plus, Search, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SpendingTrendChart } from "@/components/charts";
import { ImportWizard } from "@/components/import-wizard";
import { MetricCard } from "@/components/metric-card";
import { PageHeader, SectionHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { calculateSpending, latestSpendingMonth, spendingAmountToUsd } from "@/lib/calculations";
import { formatDate, formatMoney, formatNativeMoney, formatPct, monthKey } from "@/lib/format";
import { ApiClientError } from "@/lib/api-client";
import { useTerminalStore } from "@/store/terminal-store";
import type { SpendingDirection, SpendingTransaction, SupportedCurrency } from "@/lib/types";

export function SpendingView() {
  const spending = useTerminalStore((state) => state.spending);
  const batches = useTerminalStore((state) => state.importBatches);
  const profile = useTerminalStore((state) => state.profile);
  const rates = useTerminalStore((state) => state.fxRates);
  const [monthOverride, setMonthOverride] = useState<string>();
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SpendingTransaction>();
  const [monthDeleteOpen, setMonthDeleteOpen] = useState(false);
  const [deletingMonth, setDeletingMonth] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const deleteSpendingTransaction = useTerminalStore((state) => state.deleteSpendingTransaction);
  const deleteSpendingTransactions = useTerminalStore((state) => state.deleteSpendingTransactions);
  const deleteSpendingTransactionsForMonth = useTerminalStore((state) => state.deleteSpendingTransactionsForMonth);
  const deleteSpendingCarryover = useTerminalStore((state) => state.deleteSpendingCarryover);
  const currency = profile.displayCurrency;
  const monthOptions = useMemo(() => Array.from(new Set(spending.map((item) => item.reportMonth ?? item.occurredOn.slice(0, 7)))).sort().reverse(), [spending]);
  const month = monthOverride ?? latestSpendingMonth(spending);
  const matchingSpending = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? spending.filter((item) => `${item.category} ${item.account} ${item.note ?? ""}`.toLowerCase().includes(query))
      : spending;
  }, [search, spending]);
  const summary = calculateSpending(spending, month, rates);
  const trendData = useMemo(() => [...monthOptions].reverse().slice(-6).map((key) => { const item = calculateSpending(spending, key, rates); return { month: new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }), income: Number(item.incomeUsd), expenses: Number(item.expensesUsd) }; }), [spending, monthOptions, rates]);
  const storedCarryover = spending.find((item) => item.entryType === "CARRYOVER" && item.reportMonth === month);
  const defaultCarryover: SpendingTransaction | undefined = !storedCarryover && !new Decimal(summary.carriedSavingsUsd).isZero()
    ? {
        id: `carryover-${month}`,
        occurredOn: `${month}-01`,
        reportMonth: month,
        entryType: "CARRYOVER",
        virtual: true,
        amount: new Decimal(summary.carriedSavingsUsd).abs().toString(),
        currency: "USD",
        direction: new Decimal(summary.carriedSavingsUsd).isNegative() ? "EXPENSE" : "INCOME",
        category: "Net Savings Carryover",
        account: "Carryover",
        note: "From previous report",
      }
    : undefined;
  const carryover = storedCarryover?.deleted ? undefined : storedCarryover ?? defaultCarryover;
  const query = search.trim().toLowerCase();
  const carryoverMatchesSearch = carryover && (!query || `${carryover.category} ${carryover.account} ${carryover.note ?? ""}`.toLowerCase().includes(query));
  const filtered = [
    ...(carryoverMatchesSearch ? [carryover] : []),
    ...matchingSpending
      .filter((item) => item.entryType !== "CARRYOVER" && (item.reportMonth ?? item.occurredOn.slice(0, 7)) === month)
      .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn)),
  ];
  const selectedVisibleIds = filtered.filter((item) => selectedIds.has(item.id)).map((item) => item.id);
  const allVisibleSelected = filtered.length > 0 && selectedVisibleIds.length === filtered.length;
  const selectedMonthTransactions = [
    ...spending.filter((item) => item.entryType !== "CARRYOVER" && (item.reportMonth ?? item.occurredOn.slice(0, 7)) === month),
    ...(carryover ? [carryover] : []),
  ];
  const maxCategory = Math.max(...summary.byCategory.map((item) => Number(item.amountUsd)), 1);
  const latestBatch = batches.find((batch) => batch.source === "MONEY_LOVER");
  const selectedMonthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const deleteSelectedMonth = async () => {
    setDeletingMonth(true);
    try {
      let deleted = await deleteSpendingTransactionsForMonth(month);
      if (carryover) {
        await deleteSpendingCarryover(month);
        deleted += 1;
      }
      toast.success(`${deleted} transaction${deleted === 1 ? "" : "s"} deleted for ${selectedMonthLabel}`);
      setMonthDeleteOpen(false);
    } catch (error) {
      toast.error("Transactions could not be deleted", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setDeletingMonth(false);
    }
  };
  const toggleTransaction = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };
  const toggleAllVisible = (checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const item of filtered) {
        if (checked) next.add(item.id); else next.delete(item.id);
      }
      return next;
    });
  };
  const deleteSelectedTransactions = async () => {
    setDeletingSelected(true);
    try {
      const selected = filtered.filter((item) => selectedIds.has(item.id));
      const standardIds = selected.filter((item) => item.entryType !== "CARRYOVER").map((item) => item.id);
      const carryoverMonths = selected.filter((item) => item.entryType === "CARRYOVER").map((item) => item.reportMonth!);
      let deleted = standardIds.length ? await deleteSpendingTransactions(standardIds) : 0;
      for (const reportMonth of carryoverMonths) {
        await deleteSpendingCarryover(reportMonth);
        deleted += 1;
      }
      toast.success(`${deleted} transaction${deleted === 1 ? "" : "s"} deleted`);
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
    } catch (error) {
      toast.error("Transactions could not be deleted", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setDeletingSelected(false);
    }
  };
  const deleteOneTransaction = async (item: SpendingTransaction) => {
    if (!window.confirm("Delete this spending transaction?")) return;
    try {
      if (item.entryType === "CARRYOVER") {
        await deleteSpendingCarryover(item.reportMonth!);
      } else {
        await deleteSpendingTransaction(item.id);
      }
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      toast.success("Transaction deleted");
    } catch (error) {
      toast.error("Transaction could not be deleted", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Personal cash flow" title="Spending" description="Compare income and expenses, audit category totals, and review Money Lover imports before persistence." actions={<><Select value={month} onValueChange={(value) => { setMonthOverride(value); setSelectedIds(new Set()); }}><SelectTrigger className="w-40"><CalendarDays className="size-3.5 text-muted-foreground" /><SelectValue /></SelectTrigger><SelectContent>{monthOptions.map((key) => <SelectItem key={key} value={key}>{new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</SelectItem>)}</SelectContent></Select><Button variant="outline" size="sm" onClick={() => { setEditing(undefined); setEditorOpen(true); }}><Plus />Add transaction</Button><Button size="sm" onClick={() => setImportOpen(true)}><FileUp />Import Money Lover</Button><Button variant="destructive" size="sm" disabled={!selectedMonthTransactions.length} onClick={() => setMonthDeleteOpen(true)}><Trash2 />Delete month</Button></>} />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Income" value={formatMoney(summary.incomeUsd, currency, rates)} trend={formatMoney(summary.previousIncomeUsd, currency, rates)} trendDirection="up" detail="last month" icon={<ArrowUpRight />} />
        <MetricCard label="Expenses" value={formatMoney(summary.expensesUsd, currency, rates)} trend={formatPct(summary.expenseChangePct, true)} trendDirection={new Decimal(summary.expenseChangePct).lte(0) ? "up" : "down"} detail="vs last month" icon={<ArrowDownRight />} />
        <MetricCard label="Net savings" value={formatMoney(summary.endingSavingsUsd, currency, rates)} trend={formatMoney(summary.carriedSavingsUsd, currency, rates)} trendDirection={new Decimal(summary.carriedSavingsUsd).isZero() ? "neutral" : new Decimal(summary.carriedSavingsUsd).gt(0) ? "up" : "down"} detail="carried from prior months" icon={<PiggyBank />} />
        <MetricCard label="Savings rate" value={formatPct(summary.savingsRatePct)} trendDirection={new Decimal(summary.savingsRatePct).gte(20) ? "up" : "neutral"} detail="of recorded income" icon={<CircleDollarSign />} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Card><CardHeader><SectionHeader title="Six-month cash-flow trend" description="Income and expenses from the records matching the current filters." meta={<div className="flex gap-3 text-[10px] text-muted-foreground"><span className="flex items-center gap-1.5"><i className="size-2 rounded-sm bg-success" />Income</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-sm bg-primary" />Expenses</span></div>} /></CardHeader><CardContent className="pl-2"><SpendingTrendChart data={trendData} currency={currency} rates={rates} /></CardContent></Card>
        <Card><CardHeader><SectionHeader title="Expense categories" description={`${summary.byCategory.length} categories this month.`} meta={<Tags className="size-4 text-muted-foreground" />} /></CardHeader><CardContent className="h-64 space-y-4 overflow-y-auto pr-3">{summary.byCategory.map((item) => <div key={item.category}><div className="mb-1.5 flex items-center justify-between gap-3"><span className="text-xs font-medium">{item.category}</span><span className="numeric text-xs">{formatMoney(item.amountUsd, currency, rates)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${Number(item.amountUsd) / maxCategory * 100}%` }} /></div></div>)}{!summary.byCategory.length && <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">No expenses this month.</div>}</CardContent></Card>
      </div>
      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between"><SectionHeader title="Spending ledger" description={`${filtered.length} records in the selected period.`} meta={latestBatch && <Badge variant="info"><FileSpreadsheet />Last import: {latestBatch.acceptedRows} rows</Badge>} /><div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center"><Button variant="destructive" size="sm" disabled={!selectedVisibleIds.length} onClick={() => setBulkDeleteOpen(true)}><Trash2 />Delete selected ({selectedVisibleIds.length})</Button><div className="relative sm:w-64"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setSelectedIds(new Set()); }} className="pl-9" placeholder="Search category or account" /></div></div></CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 pl-5">
                  <Checkbox
                    aria-label="Select all visible transactions"
                    checked={allVisibleSelected ? true : selectedVisibleIds.length > 0 ? "indeterminate" : false}
                    onCheckedChange={(checked) => toggleAllVisible(checked === true)}
                  />
                </TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="pr-5 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow key={item.id} data-state={selectedIds.has(item.id) ? "selected" : undefined}>
                  <TableCell className="pl-5">
                    <Checkbox
                      aria-label={`Select ${item.category} on ${item.occurredOn}`}
                      checked={selectedIds.has(item.id)}
                      onCheckedChange={(checked) => toggleTransaction(item.id, checked === true)}
                    />
                  </TableCell>
                  <TableCell className="text-xs">{formatDate(`${item.occurredOn}T12:00:00Z`, profile.timezone)}</TableCell>
                  <TableCell>
                    <Badge variant={item.direction === "INCOME" ? "success" : "neutral"}>
                      {item.direction === "INCOME" ? <ArrowUpRight /> : <ArrowDownRight />}
                      {item.direction}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{item.category}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{item.account}</TableCell>
                  <TableCell className="max-w-64 truncate text-xs text-muted-foreground">{item.note || "—"}</TableCell>
                  <TableCell className={`numeric text-right font-medium ${item.direction === "INCOME" ? "text-success" : ""}`}>
                    <p>{item.direction === "INCOME" ? "+" : "−"}{formatMoney(spendingAmountToUsd(item.amount, item.currency, rates), currency, rates)}</p>
                    {item.currency !== currency && <p className="mt-0.5 text-[9px] font-normal text-muted-foreground">{formatNativeMoney(item.amount, item.currency)} native</p>}
                  </TableCell>
                  <TableCell className="pr-5">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${item.category}`} onClick={() => { setEditing(item); setEditorOpen(true); }}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${item.category}`} onClick={() => void deleteOneTransaction(item)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!filtered.length && (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">No matching records for this month.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-3"><Info icon={Landmark} title="Normalized direction" description="Debit, credit, negative, income, and expense conventions are reviewed before import." /><Info icon={FileSpreadsheet} title="User-scoped duplicate check" description="Normalized rows receive a SHA-256 fingerprint; matching rows are skipped." /><Info icon={CircleDollarSign} title="Display conversion" description="Stored decimal values are rendered using the visible timestamped FX snapshot." /></div>
      <ImportWizard open={importOpen} onOpenChange={setImportOpen} kind="spending" selectedMonth={month} onSelectedMonthChange={setMonthOverride} />
      <SpendingEditor key={`${editing?.id ?? "new"}-${editorOpen ? "open" : "closed"}`} open={editorOpen} onOpenChange={setEditorOpen} transaction={editing} />
      <Dialog open={monthDeleteOpen} onOpenChange={(open) => !deletingMonth && setMonthDeleteOpen(open)}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Delete all transactions for {selectedMonthLabel}?</DialogTitle><DialogDescription>This permanently deletes all {selectedMonthTransactions.length} transaction{selectedMonthTransactions.length === 1 ? "" : "s"} in the selected month, including income and expenses. This cannot be undone.</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" onClick={() => setMonthDeleteOpen(false)} disabled={deletingMonth}>Cancel</Button><Button variant="destructive" onClick={() => void deleteSelectedMonth()} disabled={deletingMonth}>{deletingMonth ? "Deleting…" : "Delete all transactions"}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={bulkDeleteOpen} onOpenChange={(open) => !deletingSelected && setBulkDeleteOpen(open)}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Delete {selectedVisibleIds.length} selected transaction{selectedVisibleIds.length === 1 ? "" : "s"}?</DialogTitle><DialogDescription>This permanently deletes only the transactions selected in the current ledger view. This cannot be undone.</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" onClick={() => setBulkDeleteOpen(false)} disabled={deletingSelected}>Cancel</Button><Button variant="destructive" onClick={() => void deleteSelectedTransactions()} disabled={deletingSelected}>{deletingSelected ? "Deleting…" : "Delete selected transactions"}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function Info({ icon: Icon, title, description }: { icon: typeof Landmark; title: string; description: string }) { return <div className="flex gap-3 rounded-lg border bg-card p-4"><Icon className="mt-0.5 size-4 shrink-0 text-primary" /><div><p className="text-xs font-medium">{title}</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p></div></div>; }

function SpendingEditor({ open, onOpenChange, transaction }: { open: boolean; onOpenChange: (value: boolean) => void; transaction?: SpendingTransaction }) {
  const add = useTerminalStore((state) => state.addSpendingTransaction);
  const update = useTerminalStore((state) => state.updateSpendingTransaction);
  const upsertCarryover = useTerminalStore((state) => state.upsertSpendingCarryover);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [date, setDate] = useState(transaction?.occurredOn ?? monthKey() + "-01");
  const [amount, setAmount] = useState(transaction?.amount ?? "");
  const [currency, setCurrency] = useState<SupportedCurrency>(transaction?.currency ?? "IDR");
  const [direction, setDirection] = useState<SpendingDirection>(transaction?.direction ?? "EXPENSE");
  const [category, setCategory] = useState(transaction?.category ?? "");
  const [account, setAccount] = useState(transaction?.account ?? "Manual");
  const [note, setNote] = useState(transaction?.note ?? "");
  const isCarryover = transaction?.entryType === "CARRYOVER";

  const save = async () => {
    setSaving(true); setError("");
    const input = {
      occurredOn: date,
      amount,
      currency,
      direction,
      category: category.trim() || "Uncategorized",
      account: account.trim() || "Manual",
      note: note.trim() || undefined,
    };
    try {
      if (transaction?.entryType === "CARRYOVER") {
        await upsertCarryover(transaction.reportMonth!, { amount, direction, note: note.trim() || undefined });
      } else if (transaction) {
        await update(transaction.id, input);
      } else {
        await add(input);
      }
      toast.success(transaction?.entryType === "CARRYOVER" ? "Carryover updated" : transaction ? "Transaction updated" : "Transaction added");
      onOpenChange(false);
    } catch (saveError) {
      setError(spendingSaveErrorMessage(saveError));
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isCarryover ? "Edit net savings carryover" : transaction ? "Edit spending transaction" : "Add spending transaction"}</DialogTitle>
          <DialogDescription>{isCarryover ? "Override the amount carried into this report. The value is stored in USD." : "Changes are persisted immediately and update all spending totals."}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {isCarryover ? (
            <>
              <Field label="Report month"><Input value={transaction.reportMonth} disabled /></Field>
              <Field label="Currency"><Input value="USD" disabled /></Field>
            </>
          ) : (
            <>
              <Field label="Date"><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
              <Field label="Currency"><Select value={currency} onValueChange={(value) => setCurrency(value as SupportedCurrency)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["USD", "IDR", "EUR"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></Field>
            </>
          )}
          <Field label="Amount"><Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" /></Field>
          <Field label="Direction"><Select value={direction} onValueChange={(value) => setDirection(value as SpendingDirection)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="EXPENSE">{isCarryover ? "Negative carryover" : "Expense"}</SelectItem><SelectItem value="INCOME">{isCarryover ? "Positive carryover" : "Income"}</SelectItem></SelectContent></Select></Field>
          {!isCarryover && <Field label="Category"><Input value={category} onChange={(event) => setCategory(event.target.value)} /></Field>}
          {!isCarryover && <Field label="Account / wallet"><Input value={account} onChange={(event) => setAccount(event.target.value)} /></Field>}
          <Field label="Note" className="sm:col-span-2"><Textarea value={note} onChange={(event) => setNote(event.target.value)} /></Field>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : isCarryover ? "Save carryover" : transaction ? "Overwrite transaction" : "Add transaction"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) { return <div className={`space-y-2 ${className ?? ""}`}><Label>{label}</Label>{children}</div>; }

function spendingSaveErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    const details = error.details as { fieldErrors?: Record<string, string[]> } | undefined;
    const invalidField = details?.fieldErrors
      ? Object.entries(details.fieldErrors).find(([, messages]) => messages.length)
      : undefined;
    if (invalidField) {
      const [field, messages] = invalidField;
      return `${field.charAt(0).toUpperCase()}${field.slice(1)}: ${messages[0]}`;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "Transaction could not be saved.";
}
