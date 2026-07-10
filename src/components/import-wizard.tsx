"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, FileSpreadsheet, FileUp, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiRequest } from "@/lib/api-client";
import { normalizePortfolio, normalizeSpending } from "@/lib/imports";
import { useTerminalStore } from "@/store/terminal-store";

type ImportKind = "spending" | "portfolio";
type Mapping = Record<string, string>;

const spendingFields = [
  { key: "date", label: "Date", required: true, aliases: ["date", "occurred_on", "transaction date"] },
  { key: "amount", label: "Amount", required: true, aliases: ["amount", "value", "total"] },
  { key: "direction", label: "Direction", required: true, aliases: ["direction", "type", "income/expense"] },
  { key: "category", label: "Category", required: false, aliases: ["category", "group"] },
  { key: "account", label: "Account", required: false, aliases: ["account", "wallet"] },
  { key: "note", label: "Note", required: false, aliases: ["note", "description", "details"] },
  { key: "currency", label: "Currency", required: false, aliases: ["currency", "ccy"] },
];

const portfolioFields = [
  { key: "asset", label: "Asset symbol", required: true, aliases: ["asset", "asset symbol", "symbol", "coin"] },
  { key: "type", label: "Transaction type", required: true, aliases: ["type", "transaction type", "side"] },
  { key: "quantity", label: "Quantity", required: true, aliases: ["quantity", "qty", "amount"] },
  { key: "price", label: "Unit price USD", required: true, aliases: ["unit price usd", "price", "execution price"] },
  { key: "date", label: "Executed at", required: true, aliases: ["executed at", "date", "timestamp"] },
  { key: "fee", label: "Fee USD", required: false, aliases: ["fee", "fee usd"] },
  { key: "venue", label: "Venue", required: false, aliases: ["venue", "exchange"] },
  { key: "note", label: "Note", required: false, aliases: ["note", "description"] },
];

interface PreviewRow {
  index: number;
  status: "ACCEPTED" | "DUPLICATE" | "INVALID";
  issues: string[];
  display: string[];
  fingerprint: string;
}

interface PreviewResponse {
  batchId: string;
  accepted: number;
  duplicate: number;
  invalid: number;
  rows: Array<{
    rowNumber: number;
    status: PreviewRow["status"];
    fingerprint: string;
    display: string[];
    issues: string[];
  }>;
  truncated: boolean;
}

export { normalizePortfolio, normalizeSpending };

export function ImportWizard({ open, onOpenChange, kind }: { open: boolean; onOpenChange: (value: boolean) => void; kind: ImportKind }) {
  const [step, setStep] = useState(1);
  const [selectedFile, setSelectedFile] = useState<File>();
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [batchId, setBatchId] = useState("");
  const [counts, setCounts] = useState({ accepted: 0, duplicate: 0, invalid: 0 });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const refreshWorkspace = useTerminalStore((state) => state.refreshWorkspace);
  const fields = kind === "spending" ? spendingFields : portfolioFields;
  const requiredMapped = fields.filter((field) => field.required).every((field) => mapping[field.key]);
  const reset = () => { setStep(1); setSelectedFile(undefined); setFileName(""); setHeaders([]); setRows([]); setMapping({}); setPreview([]); setBatchId(""); setCounts({ accepted: 0, duplicate: 0, invalid: 0 }); setError(""); setSubmitting(false); if (inputRef.current) inputRef.current.value = ""; };

  const handleFile = async (file?: File) => {
    setError("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") { setError("Choose a CSV file."); return; }
    if (file.size > 10 * 1024 * 1024) { setError("CSV files must be 10 MB or smaller."); return; }
    const text = await file.text();
    const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy", transformHeader: (header) => header.trim() });
    if (result.errors.length && !result.data.length) { setError(result.errors[0].message); return; }
    const detected = result.meta.fields ?? [];
    if (!detected.length) { setError("No header row was detected."); return; }
    const autoMap: Mapping = {};
    fields.forEach((field) => {
      const match = detected.find((header) => field.aliases.includes(header.toLowerCase().trim()));
      if (match) autoMap[field.key] = match;
    });
    setSelectedFile(file); setFileName(file.name); setHeaders(detected); setRows(result.data.slice(0, 5000)); setMapping(autoMap); setStep(2);
  };

  const createPreview = async () => {
    if (!selectedFile) return;
    setSubmitting(true); setError("");
    const form = new FormData();
    form.set("file", selectedFile);
    form.set("kind", kind);
    form.set("mapping", JSON.stringify(mapping));
    try {
      const result = await apiRequest<PreviewResponse>("/api/imports/preview", { method: "POST", body: form });
      setBatchId(result.batchId);
      setCounts({ accepted: result.accepted, duplicate: result.duplicate, invalid: result.invalid });
      setPreview(result.rows.map((row) => ({ index: row.rowNumber, status: row.status, issues: row.issues, display: row.display, fingerprint: row.fingerprint })));
      setStep(3);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "The CSV could not be previewed.");
    } finally {
      setSubmitting(false);
    }
  };

  const confirm = async () => {
    if (!batchId) return;
    setSubmitting(true); setError("");
    try {
      await apiRequest(`/api/imports/${batchId}/confirm`, { method: "POST" });
      await refreshWorkspace();
      toast.success(`${counts.accepted} ${kind === "spending" ? "spending" : "portfolio"} rows imported`, { description: `${counts.duplicate} duplicates and ${counts.invalid} invalid rows skipped.` });
      onOpenChange(false); reset();
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "The import could not be confirmed.");
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { onOpenChange(value); if (!value) reset(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader><DialogTitle>{kind === "spending" ? "Import Money Lover CSV" : "Import portfolio CSV"}</DialogTitle><DialogDescription>Upload, map, validate, and explicitly confirm rows. No ledger rows are saved before the final step.</DialogDescription></DialogHeader>
        <div className="flex gap-1.5">{[1, 2, 3].map((value) => <div key={value} className={`h-1 flex-1 rounded-full ${value <= step ? "bg-primary" : "bg-secondary"}`} />)}</div>
        {step === 1 && <div className="py-3"><button type="button" onClick={() => inputRef.current?.click()} className="flex min-h-64 w-full flex-col items-center justify-center rounded-lg border border-dashed border-input bg-background/35 p-8 text-center transition hover:border-primary/50 hover:bg-primary/[0.025]"><span className="flex size-12 items-center justify-center rounded-xl border bg-secondary text-primary"><FileUp className="size-5" /></span><p className="mt-4 text-sm font-medium">Choose a CSV file</p><p className="mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">Maximum 10 MB. The first row must contain column names. Up to 5,000 rows are validated server-side.</p></button><input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void handleFile(event.target.files?.[0])} />{error && <p className="mt-3 flex items-center gap-2 text-xs text-destructive"><AlertCircle className="size-3.5" />{error}</p>}<div className="mt-4 rounded-md border bg-muted/35 p-3 text-xs text-muted-foreground"><strong className="text-foreground">Expected required fields:</strong> {fields.filter((field) => field.required).map((field) => field.label).join(", ")}.</div></div>}
        {step === 2 && <div className="py-2"><div className="mb-5 flex items-center gap-3 rounded-lg border bg-background/45 p-3"><FileSpreadsheet className="size-5 text-success" /><div><p className="text-sm font-medium">{fileName}</p><p className="text-xs text-muted-foreground">{rows.length.toLocaleString()} rows · {headers.length} columns detected</p></div><Button variant="ghost" size="icon-sm" className="ml-auto" onClick={reset} aria-label="Choose a different file"><RotateCcw /></Button></div><div className="grid gap-4 sm:grid-cols-2">{fields.map((field) => <div key={field.key} className="space-y-2"><Label>{field.label} {field.required && <span className="text-primary">*</span>}</Label><Select value={mapping[field.key] || "__none"} onValueChange={(value) => setMapping((current) => ({ ...current, [field.key]: value === "__none" ? "" : value }))}><SelectTrigger><SelectValue placeholder="Select source column" /></SelectTrigger><SelectContent><SelectItem value="__none">Not mapped</SelectItem>{headers.map((header) => <SelectItem key={header} value={header}>{header}</SelectItem>)}</SelectContent></Select></div>)}</div></div>}
        {step === 3 && <div className="min-h-0 py-2"><div className="mb-4 grid grid-cols-3 gap-3">{[{ label: "Accepted", value: counts.accepted, icon: CheckCircle2, style: "text-success" }, { label: "Duplicate", value: counts.duplicate, icon: AlertCircle, style: "text-warning" }, { label: "Invalid", value: counts.invalid, icon: XCircle, style: "text-risk" }].map(({ label, value, icon: Icon, style }) => <div key={label} className="rounded-lg border bg-background/45 p-3"><div className="flex items-center gap-2"><Icon className={`size-3.5 ${style}`} /><span className="text-[10px] tracking-wider text-muted-foreground uppercase">{label}</span></div><p className="numeric mt-2 text-xl font-semibold">{value}</p></div>)}</div><div className="max-h-[42vh] overflow-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Status</TableHead><TableHead>{kind === "spending" ? "Date / direction" : "Asset / type"}</TableHead><TableHead>Value</TableHead><TableHead>Issue</TableHead></TableRow></TableHeader><TableBody>{preview.slice(0, 200).map((row) => <TableRow key={row.index}><TableCell className="numeric text-xs text-muted-foreground">{row.index}</TableCell><TableCell><Badge variant={row.status === "ACCEPTED" ? "success" : row.status === "DUPLICATE" ? "warning" : "risk"}>{row.status}</Badge></TableCell><TableCell className="text-xs">{row.display[0]}</TableCell><TableCell className="numeric text-xs">{row.display[1]}</TableCell><TableCell className="max-w-xs text-xs text-muted-foreground">{row.issues.join("; ") || (row.status === "DUPLICATE" ? "Matching fingerprint" : "Ready")}</TableCell></TableRow>)}</TableBody></Table></div>{preview.length > 200 && <p className="mt-2 text-xs text-muted-foreground">Showing the first 200 preview rows.</p>}</div>}
        {error && step > 1 && <p className="flex items-center gap-2 text-xs text-destructive"><AlertCircle className="size-3.5" />{error}</p>}
        <DialogFooter><Button variant="ghost" onClick={step === 1 ? () => onOpenChange(false) : () => setStep((value) => value - 1)} disabled={submitting}>{step > 1 && <ArrowLeft />}{step === 1 ? "Cancel" : "Back"}</Button>{step === 2 && <Button onClick={() => void createPreview()} disabled={!requiredMapped || submitting}>{submitting ? "Validating…" : "Validate rows"}<ArrowRight /></Button>}{step === 3 && <Button onClick={() => void confirm()} disabled={counts.accepted === 0 || submitting}>{submitting ? "Importing…" : `Confirm ${counts.accepted} rows`}<CheckCircle2 /></Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
