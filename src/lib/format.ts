import Decimal from "decimal.js";
import type { DecimalString, DisplayCurrency, FxRate } from "@/lib/types";

const symbols: Record<DisplayCurrency, string> = {
  USD: "$",
  IDR: "Rp",
  EUR: "€",
};

export function formatMoney(
  usdValue: DecimalString | number,
  currency: DisplayCurrency = "USD",
  rates?: FxRate[],
  compact = false,
) {
  const rate = rates?.find((item) => item.currency === currency)?.usdRate ?? "1";
  const amount = new Decimal(usdValue || 0).mul(rate).toNumber();
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: currency === "IDR" ? "code" : "narrowSymbol",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: currency === "IDR" ? 0 : compact ? 1 : 2,
    minimumFractionDigits: compact || currency === "IDR" ? 0 : 2,
  })
    .format(amount)
    .replace("IDR", symbols.IDR);
}

export function formatNativeMoney(value: DecimalString | number, currency: DisplayCurrency) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: currency === "IDR" ? "code" : "narrowSymbol",
    maximumFractionDigits: currency === "IDR" ? 0 : 2,
    minimumFractionDigits: currency === "IDR" ? 0 : 2,
  })
    .format(new Decimal(value || 0).toNumber())
    .replace("IDR", symbols.IDR);
}

export function formatDecimal(value: DecimalString, maximumFractionDigits = 6) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(
    new Decimal(value || 0).toNumber(),
  );
}

export function formatPct(value: DecimalString | number, signed = false) {
  const amount = new Decimal(value || 0).toNumber();
  return `${signed && amount > 0 ? "+" : ""}${amount.toFixed(2)}%`;
}

export function formatDateTime(iso: string, timezone = "UTC") {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
    timeZoneName: "short",
  }).format(new Date(iso));
}

export function formatDate(iso: string, timezone = "UTC") {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: timezone,
  }).format(new Date(iso));
}

export function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function previousMonth(month: string) {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, value - 2, 1));
  return monthKey(date);
}

export function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}
