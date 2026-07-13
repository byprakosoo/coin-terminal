import Decimal from "decimal.js";
import Papa from "papaparse";
import type {
  PortfolioTransaction,
  SpendingDirection,
  SpendingTransaction,
  TransactionType,
} from "@/lib/types";

export type ImportKind = "spending" | "portfolio";
export type ImportMapping = Record<string, string>;

export interface NormalizedImportResult {
  issues: string[];
  fingerprintValue: string;
  display: string[];
  spending?: Omit<SpendingTransaction, "id">;
  portfolio?: Omit<PortfolioTransaction, "id">;
}

export function decodeImportText(input: ArrayBuffer | Uint8Array) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const encoding =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? "utf-16le"
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? "utf-16be"
        : bytes.length >= 4 && bytes[1] === 0 && bytes[3] === 0
          ? "utf-16le"
          : "utf-8";
  return new TextDecoder(encoding).decode(bytes).replace(/^\uFEFF/, "");
}

export function parseImportFile(input: ArrayBuffer | Uint8Array) {
  return Papa.parse<Record<string, string>>(decodeImportText(input), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
  });
}

function normalizeDate(value: string) {
  const trimmed = value.trim();
  const dayFirst = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (dayFirst) {
    const [, day, month, year] = dayFirst;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    const valid =
      parsed.getUTCFullYear() === Number(year) &&
      parsed.getUTCMonth() === Number(month) - 1 &&
      parsed.getUTCDate() === Number(day);
    return valid ? parsed.toISOString() : "";
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function normalizedDecimal(value: string) {
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  try {
    const decimal = new Decimal(cleaned);
    return decimal.isFinite() ? decimal.toString() : "";
  } catch {
    return "";
  }
}

export function normalizeSpending(
  raw: Record<string, string>,
  mapping: ImportMapping,
): NormalizedImportResult {
  const issues: string[] = [];
  const dateValue = normalizeDate(raw[mapping.date] ?? "");
  const signedAmount = normalizedDecimal(raw[mapping.amount] ?? "");
  const rawDirection = (raw[mapping.direction] ?? "").toUpperCase().trim();
  const direction: SpendingDirection | "" = /^(INCOME|CREDIT|IN|RECEIVE|RECEIVED)$/.test(rawDirection)
    ? "INCOME"
    : /^(EXPENSE|DEBIT|OUT|SPEND|SPENDING)$/.test(rawDirection)
      ? "EXPENSE"
      : signedAmount && !new Decimal(signedAmount).isZero()
        ? new Decimal(signedAmount).isNegative()
          ? "EXPENSE"
          : "INCOME"
        : "";
  if (!dateValue) issues.push("Invalid date");
  if (!signedAmount || new Decimal(signedAmount || 0).isZero()) issues.push("Invalid amount");
  if (!direction) issues.push("Unknown direction");
  const date = dateValue ? dateValue.slice(0, 10) : "";
  const amount = signedAmount ? new Decimal(signedAmount).abs().toString() : "0";
  const category = raw[mapping.category] || "Uncategorized";
  const account = raw[mapping.account] || "Imported";
  const note = raw[mapping.note] || undefined;
  const currencyRaw = (raw[mapping.currency] || "USD").toUpperCase().trim();
  const currency: SpendingTransaction["currency"] =
    currencyRaw === "IDR" || currencyRaw === "EUR" ? currencyRaw : "USD";
  const spending = issues.length
    ? undefined
    : {
        occurredOn: date,
        amount,
        currency,
        direction: direction as SpendingDirection,
        category,
        account,
        note,
      };
  return {
    issues,
    spending,
    fingerprintValue: [date, amount, direction, category, account, note].join("|"),
    display: [`${date || "—"} · ${direction || "?"}`, `${amount} ${currency}`],
  };
}

export function normalizePortfolio(
  raw: Record<string, string>,
  mapping: ImportMapping,
): NormalizedImportResult {
  const issues: string[] = [];
  const assetSymbol = (raw[mapping.asset] ?? "").toUpperCase().trim();
  const type = (raw[mapping.type] ?? "").toUpperCase().trim().replaceAll(" ", "_") as TransactionType;
  const validTypes: TransactionType[] = [
    "BUY",
    "SELL",
    "TRANSFER_IN",
    "TRANSFER_OUT",
    "REWARD",
    "AIRDROP",
    "FEE",
  ];
  const quantityValue = normalizedDecimal(raw[mapping.quantity] ?? "");
  const priceValue = normalizedDecimal(raw[mapping.price] ?? "");
  const feeValue = normalizedDecimal(raw[mapping.fee] ?? "0");
  const executedAt = normalizeDate(raw[mapping.date] ?? "");
  if (!/^[A-Z0-9]{2,20}$/.test(assetSymbol)) issues.push("Invalid asset symbol");
  if (!validTypes.includes(type)) issues.push("Unknown transaction type");
  if (
    !quantityValue ||
    (type !== "FEE" ? !new Decimal(quantityValue).gt(0) : new Decimal(quantityValue).isNegative())
  ) {
    issues.push("Invalid quantity");
  }
  if (
    !priceValue ||
    new Decimal(priceValue || 0).isNegative() ||
    (["BUY", "SELL"].includes(type) && !new Decimal(priceValue || 0).gt(0))
  ) {
    issues.push("Invalid price");
  }
  if (!feeValue || new Decimal(feeValue || 0).isNegative()) issues.push("Invalid fee");
  if (!executedAt) issues.push("Invalid date");
  const portfolio = issues.length
    ? undefined
    : {
        assetSymbol,
        transactionType: type,
        quantity: quantityValue || "0",
        unitPriceUsd: priceValue || "0",
        feeUsd: feeValue || "0",
        venue: raw[mapping.venue] || "Imported",
        executedAt,
        note: raw[mapping.note] || undefined,
      };
  return {
    issues,
    portfolio,
    fingerprintValue: [assetSymbol, type, quantityValue, priceValue, executedAt, feeValue].join("|"),
    display: [`${assetSymbol || "?"} · ${type || "?"}`, `${quantityValue || "0"} @ $${priceValue || "0"}`],
  };
}
