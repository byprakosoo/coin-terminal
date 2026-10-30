import type { DecimalString } from "@/lib/types";

/** How a snapshot field value was derived. Mirrors PRD §9.1 `SnapshotFieldSource`. */
export type SnapshotFieldSource =
  | "MANUAL_REQUIRED"
  | "CARRIED_FORWARD"
  | "LEDGER_CALCULATED"
  | "GOLD_CALCULATED"
  | "WORKBOOK_IMPORTED"
  | "USER_OVERRIDE"
  | "UNAVAILABLE";

export type SnapshotSource = "MANUAL" | "HYBRID_PREFILL" | "XLSX_IMPORT";
export type GoldTransactionType = "BUY" | "SELL";
export type GoldValuationSource = "MANUAL" | "XLSX_IMPORT";
export type WorkbookUploadStatus =
  | "UPLOADING"
  | "READY"
  | "PREVIEWED"
  | "CONFIRMED"
  | "FAILED"
  | "EXPIRED";
export type WorkbookConflictResolution = "KEEP_APP" | "USE_WORKBOOK" | "KEEP_BOTH";
export type WorkbookPreviewRowStatus =
  | "ACCEPTED"
  | "DUPLICATE"
  | "CONFLICT"
  | "INVALID"
  | "SKIPPED";
export type WorkbookPreviewEntity =
  | "snapshot"
  | "gold_transaction"
  | "gold_valuation"
  | "annual";

/** The eight fixed IDR allocation categories (PRD §5, §8.1). */
export interface PortfolioSnapshotValues {
  bankIdr: DecimalString;
  rdpuIdr: DecimalString;
  ihsgIdr: DecimalString;
  sp500Idr: DecimalString;
  btcIdr: DecimalString;
  ethIdr: DecimalString;
  altcoinIdr: DecimalString;
  goldIdr: DecimalString;
}

export interface SnapshotPrefillMetadata {
  fieldSources?: Partial<Record<keyof PortfolioSnapshotValues, SnapshotFieldSource>>;
  fxRate?: { idrPerUsd: DecimalString; observedAt?: string };
  marketObservedAt?: string;
  goldValuationDate?: string;
  missingAssetPrices?: string[];
  warnings?: string[];
}

export interface PortfolioSnapshot extends PortfolioSnapshotValues {
  id: string;
  asOfDate: string;
  sequence: number;
  source: SnapshotSource;
  idrPerUsd?: DecimalString;
  prefillMetadata?: SnapshotPrefillMetadata;
  note?: string;
  fingerprint?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioSnapshotSummary {
  asOfDate: string;
  sequence: number;
  liquidIdr: DecimalString;
  stocksIdr: DecimalString;
  cryptoIdr: DecimalString;
  goldIdr: DecimalString;
  totalIdr: DecimalString;
  totalUsd?: DecimalString;
  increaseIdr?: DecimalString;
  changePct?: DecimalString;
  allocationPct: PortfolioSnapshotValues;
}

export interface GoldTransaction {
  id: string;
  transactionType: GoldTransactionType;
  occurredOn: string;
  goldType: string;
  grams: DecimalString;
  unitPriceIdr: DecimalString;
  venue?: string;
  note?: string;
  fingerprint?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GoldValuation {
  id: string;
  asOfDate: string;
  pricePerGramIdr: DecimalString;
  source: GoldValuationSource;
  note?: string;
  fingerprint?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GoldSummary {
  heldGrams: DecimalString;
  valuationPricePerGramIdr?: DecimalString;
  valuationDate?: string;
  marketValueIdr?: DecimalString;
  remainingCostBasisIdr: DecimalString;
  averageCostPerGramIdr: DecimalString;
  grossPurchaseCostIdr: DecimalString;
  soldGrams: DecimalString;
  saleProceedsIdr: DecimalString;
  realizedPnlIdr: DecimalString;
  unrealizedPnlIdr?: DecimalString;
  unrealizedPnlPct?: DecimalString;
}

export interface AnnualRecapSetting {
  id: string;
  year: number;
  monthlySalaryIdr?: DecimalString;
  closingSnapshotId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnnualRecapRow {
  year: number;
  closingSnapshotId?: string;
  closingDate?: string;
  netWorthIdr: DecimalString;
  gainLossIdr?: DecimalString;
  yoyPct?: DecimalString;
  averageMonthlyChangeIdr?: DecimalString;
  monthlySalaryIdr?: DecimalString;
  isPartialYear?: boolean;
}

export interface WorkbookTemplateSummary {
  available: boolean;
  filename?: string;
  checksum?: string;
  size?: number;
  activatedAt?: string;
}

export interface PortfolioRecapSummary {
  snapshots: PortfolioSnapshot[];
  latestSummary?: PortfolioSnapshotSummary;
  gold: {
    transactions: GoldTransaction[];
    valuations: GoldValuation[];
    summary: GoldSummary;
  };
  annual: {
    settings: AnnualRecapSetting[];
    rows: AnnualRecapRow[];
    cagrPct?: DecimalString;
  };
  template: WorkbookTemplateSummary;
  btcBalance?: { quantity: DecimalString; updatedAt: string };
}

/** Result of `GET /api/portfolio-recap/prefill?asOf=` (PRD §9.3, §7.2). */
export interface SnapshotPrefill extends PortfolioSnapshotValues {
  asOfDate: string;
  idrPerUsd?: DecimalString;
  fieldSources: Partial<Record<keyof PortfolioSnapshotValues, SnapshotFieldSource>>;
  fxRate?: { idrPerUsd: DecimalString; observedAt?: string };
  marketObservedAt?: string;
  goldValuationDate?: string;
  missingAssetPrices?: string[];
  warnings: string[];
}

export interface WorkbookUploadSession {
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
  expiresAt: string;
}

export interface WorkbookImportPreviewRow {
  entity: WorkbookPreviewEntity;
  sourceSheet: string;
  sourceRow: number;
  status: WorkbookPreviewRowStatus;
  display: string[];
  issues: string[];
  fingerprint?: string;
  existingId?: string;
  resolutions?: WorkbookConflictResolution[];
}

export interface WorkbookImportPreview {
  batchId: string;
  sheets: string[];
  rows: WorkbookImportPreviewRow[];
  counts: {
    accepted: number;
    duplicate: number;
    conflict: number;
    invalid: number;
    skipped: number;
  };
}

export interface SnapshotInput {
  asOfDate: string;
  bankIdr: DecimalString;
  rdpuIdr: DecimalString;
  ihsgIdr: DecimalString;
  sp500Idr: DecimalString;
  btcIdr: DecimalString;
  ethIdr: DecimalString;
  altcoinIdr: DecimalString;
  goldIdr: DecimalString;
  idrPerUsd?: DecimalString;
  source?: SnapshotSource;
  prefillMetadata?: SnapshotPrefillMetadata;
  note?: string;
  btcQuantity?: DecimalString;
}

export interface GoldTransactionInput {
  transactionType: GoldTransactionType;
  occurredOn: string;
  goldType: string;
  grams: DecimalString;
  unitPriceIdr: DecimalString;
  venue?: string;
  note?: string;
}

export interface GoldValuationInput {
  asOfDate: string;
  pricePerGramIdr: DecimalString;
  source?: GoldValuationSource;
  note?: string;
}

export interface AnnualRecapInput {
  monthlySalaryIdr?: DecimalString;
  closingSnapshotId?: string | null;
}

export const RECAP_CATEGORIES: ReadonlyArray<{
  key: keyof PortfolioSnapshotValues;
  label: string;
  group: "liquid" | "stocks" | "crypto" | "gold";
}> = [
  { key: "bankIdr", label: "Bank", group: "liquid" },
  { key: "rdpuIdr", label: "RDPU", group: "liquid" },
  { key: "ihsgIdr", label: "IHSG", group: "stocks" },
  { key: "sp500Idr", label: "S&P 500", group: "stocks" },
  { key: "btcIdr", label: "BTC", group: "crypto" },
  { key: "ethIdr", label: "ETH", group: "crypto" },
  { key: "altcoinIdr", label: "Altcoin", group: "crypto" },
  { key: "goldIdr", label: "Gold", group: "gold" },
];
