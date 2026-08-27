import "server-only";
import Decimal from "decimal.js";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { annualRecapSettings, goldTransactions, goldValuations, portfolioRecapSnapshots } from "@/db/schema";
import { ApiError } from "@/server/api";
import { createId } from "@/server/ids";
import type { AnnualRecapRow, GoldTransaction, GoldValuation, PortfolioRecapSummary, PortfolioSnapshot } from "@/features/portfolio-recap/types";
import { computeGoldSummary } from "@/features/portfolio-recap/recap-calc";
import type { goldTransactionSchema, goldValuationSchema, portfolioRecapSnapshotSchema } from "@/server/validators";
import type { z } from "zod";

type SnapshotInput = z.infer<typeof portfolioRecapSnapshotSchema>;
type GoldTransactionInput = z.infer<typeof goldTransactionSchema>;
type GoldValuationInput = z.infer<typeof goldValuationSchema>;
type SnapshotRow = typeof portfolioRecapSnapshots.$inferSelect;
type GoldTransactionRow = typeof goldTransactions.$inferSelect;
type GoldValuationRow = typeof goldValuations.$inferSelect;

export async function getPortfolioRecap(userId: string): Promise<PortfolioRecapSummary> {
  const [rows, goldTransactionRows, goldValuationRows, annualSettingsRows] = await Promise.all([
    db
    .select()
    .from(portfolioRecapSnapshots)
    .where(eq(portfolioRecapSnapshots.userId, userId))
    .orderBy(asc(portfolioRecapSnapshots.asOfDate), asc(portfolioRecapSnapshots.sequence)),
    db.select().from(goldTransactions).where(eq(goldTransactions.userId, userId)).orderBy(asc(goldTransactions.occurredOn), asc(goldTransactions.createdAt), asc(goldTransactions.id)),
    db.select().from(goldValuations).where(eq(goldValuations.userId, userId)).orderBy(asc(goldValuations.asOfDate), asc(goldValuations.createdAt), asc(goldValuations.id)),
    db.select().from(annualRecapSettings).where(eq(annualRecapSettings.userId, userId)).orderBy(asc(annualRecapSettings.year)),
  ]);
  const snapshots = rows.map(mapSnapshot);
  const transactions = goldTransactionRows.map(mapGoldTransaction);
  const valuations = goldValuationRows.map(mapGoldValuation);
  const settings = annualSettingsRows.map((row) => ({ id: row.id, year: row.year, monthlySalaryIdr: row.monthlySalaryIdr ?? undefined, closingSnapshotId: row.closingSnapshotId ?? undefined, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }));

  return {
    snapshots,
    latestSummary: snapshots.length ? summaryFor(snapshots) : undefined,
    gold: { transactions, valuations, summary: computeGoldSummary(transactions, valuations) },
    annual: { settings, rows: annualRows(settings, snapshots) },
    template: { available: false },
  };
}

function mapGoldTransaction(row: GoldTransactionRow): GoldTransaction {
  return { id: row.id, transactionType: row.transactionType, occurredOn: row.occurredOn, goldType: row.goldType, grams: row.grams, unitPriceIdr: row.unitPriceIdr, venue: row.venue ?? undefined, note: row.note ?? undefined, fingerprint: row.fingerprint ?? undefined, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function mapGoldValuation(row: GoldValuationRow): GoldValuation {
  return { id: row.id, asOfDate: row.asOfDate, pricePerGramIdr: row.pricePerGramIdr, source: row.source, note: row.note ?? undefined, fingerprint: row.fingerprint ?? undefined, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function annualRows(settings: PortfolioRecapSummary["annual"]["settings"], snapshots: PortfolioSnapshot[]): AnnualRecapRow[] {
  const sorted = [...snapshots].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate) || a.sequence - b.sequence); const byId = new Map(sorted.map((snapshot) => [snapshot.id, snapshot])); let previous: Decimal | undefined;
  return settings.map((setting) => { const closing = (setting.closingSnapshotId ? byId.get(setting.closingSnapshotId) : undefined) ?? sorted.filter((snapshot) => snapshot.asOfDate.startsWith(`${setting.year}-`)).at(-1); const netWorth = closing ? totalFor(closing) : new Decimal(0); const gainLoss = previous ? netWorth.minus(previous) : undefined; const row = { year: setting.year, closingSnapshotId: closing?.id, closingDate: closing?.asOfDate, netWorthIdr: netWorth.toString(), gainLossIdr: gainLoss?.toString(), yoyPct: gainLoss && previous?.gt(0) ? gainLoss.div(previous).mul(100).toString() : undefined, averageMonthlyChangeIdr: gainLoss?.div(12).toString(), monthlySalaryIdr: setting.monthlySalaryIdr, isPartialYear: setting.year === new Date().getUTCFullYear() }; previous = netWorth; return row; });
}

export async function createPortfolioRecapSnapshot(userId: string, input: SnapshotInput) {
  const [latestForDate] = await db
    .select({ sequence: portfolioRecapSnapshots.sequence })
    .from(portfolioRecapSnapshots)
    .where(
      and(
        eq(portfolioRecapSnapshots.userId, userId),
        eq(portfolioRecapSnapshots.asOfDate, input.asOfDate),
      ),
    )
    .orderBy(desc(portfolioRecapSnapshots.sequence))
    .limit(1);
  const id = createId();
  await db.insert(portfolioRecapSnapshots).values(snapshotValues(userId, id, input, (latestForDate?.sequence ?? 0) + 1));
  return requireSnapshot(userId, id);
}

export async function createGoldTransaction(userId: string, input: GoldTransactionInput) {
  const id = createId();
  await assertValidGoldSequence(userId, {
    id,
    transactionType: input.transactionType,
    occurredOn: input.occurredOn,
    grams: new Decimal(input.grams).toString(),
    createdAt: new Date(),
  });
  await db.insert(goldTransactions).values(goldTransactionValues(userId, id, input));
  return requireGoldTransaction(userId, id);
}

export async function createGoldValuation(userId: string, input: GoldValuationInput) {
  const id = createId();
  await db.insert(goldValuations).values({
    id,
    userId,
    asOfDate: input.asOfDate,
    pricePerGramIdr: new Decimal(input.pricePerGramIdr).toString(),
    source: input.source ?? "MANUAL",
    note: input.note || null,
  });
  return requireGoldValuation(userId, id);
}

export async function updateGoldTransaction(userId: string, id: string, input: GoldTransactionInput) {
  const existing = await requireGoldTransactionRow(userId, id);
  await assertValidGoldSequence(
    userId,
    {
      id,
      transactionType: input.transactionType,
      occurredOn: input.occurredOn,
      grams: new Decimal(input.grams).toString(),
      createdAt: existing.createdAt,
    },
    id,
  );
  await db
    .update(goldTransactions)
    .set(goldTransactionFields(input))
    .where(and(eq(goldTransactions.id, id), eq(goldTransactions.userId, userId)));
  return requireGoldTransaction(userId, id);
}

export async function deleteGoldTransaction(userId: string, id: string) {
  await requireGoldTransactionRow(userId, id);
  await assertValidGoldSequence(userId, undefined, id);
  const result = await db
    .delete(goldTransactions)
    .where(and(eq(goldTransactions.id, id), eq(goldTransactions.userId, userId)));
  if (!affectedRows(result)) {
    throw new ApiError(409, "The gold transaction changed before deletion.", "CONFLICT");
  }
}

export async function updateGoldValuation(userId: string, id: string, input: GoldValuationInput) {
  await requireGoldValuationRow(userId, id);
  await db
    .update(goldValuations)
    .set({
      asOfDate: input.asOfDate,
      pricePerGramIdr: new Decimal(input.pricePerGramIdr).toString(),
      source: input.source ?? "MANUAL",
      note: input.note || null,
    })
    .where(and(eq(goldValuations.id, id), eq(goldValuations.userId, userId)));
  return requireGoldValuation(userId, id);
}

export async function deleteGoldValuation(userId: string, id: string) {
  await requireGoldValuationRow(userId, id);
  const result = await db
    .delete(goldValuations)
    .where(and(eq(goldValuations.id, id), eq(goldValuations.userId, userId)));
  if (!affectedRows(result)) {
    throw new ApiError(409, "The gold valuation changed before deletion.", "CONFLICT");
  }
}

export async function updatePortfolioRecapSnapshot(userId: string, id: string, input: SnapshotInput) {
  const existing = await requireSnapshot(userId, id);
  await db
    .update(portfolioRecapSnapshots)
    .set(snapshotValues(userId, id, input, existing.sequence))
    .where(and(eq(portfolioRecapSnapshots.id, id), eq(portfolioRecapSnapshots.userId, userId)));
  return requireSnapshot(userId, id);
}

export async function deletePortfolioRecapSnapshot(userId: string, id: string) {
  const result = await db
    .delete(portfolioRecapSnapshots)
    .where(and(eq(portfolioRecapSnapshots.id, id), eq(portfolioRecapSnapshots.userId, userId)));
  const affectedRows = Array.isArray(result)
    ? result[0]?.affectedRows
    : (result as { affectedRows?: number }).affectedRows;
  if (!affectedRows) throw new ApiError(404, "Snapshot not found.", "NOT_FOUND");
}

async function requireSnapshot(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(portfolioRecapSnapshots)
    .where(and(eq(portfolioRecapSnapshots.id, id), eq(portfolioRecapSnapshots.userId, userId)))
    .limit(1);
  if (!row) throw new ApiError(404, "Snapshot not found.", "NOT_FOUND");
  return mapSnapshot(row);
}

async function requireGoldTransactionRow(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(goldTransactions)
    .where(and(eq(goldTransactions.id, id), eq(goldTransactions.userId, userId)))
    .limit(1);
  if (!row) throw new ApiError(404, "Gold transaction not found.", "NOT_FOUND");
  return row;
}

async function requireGoldTransaction(userId: string, id: string) {
  return mapGoldTransaction(await requireGoldTransactionRow(userId, id));
}

async function requireGoldValuationRow(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(goldValuations)
    .where(and(eq(goldValuations.id, id), eq(goldValuations.userId, userId)))
    .limit(1);
  if (!row) throw new ApiError(404, "Gold valuation not found.", "NOT_FOUND");
  return row;
}

async function requireGoldValuation(userId: string, id: string) {
  return mapGoldValuation(await requireGoldValuationRow(userId, id));
}

function goldTransactionFields(input: GoldTransactionInput) {
  return {
    transactionType: input.transactionType,
    occurredOn: input.occurredOn,
    goldType: input.goldType,
    grams: new Decimal(input.grams).toString(),
    unitPriceIdr: new Decimal(input.unitPriceIdr).toString(),
    venue: input.venue || null,
    note: input.note || null,
  };
}

function goldTransactionValues(userId: string, id: string, input: GoldTransactionInput) {
  return { id, userId, ...goldTransactionFields(input) };
}

type GoldSequenceRecord = {
  id: string;
  transactionType: "BUY" | "SELL";
  occurredOn: string;
  grams: string;
  createdAt: Date;
};

async function assertValidGoldSequence(
  userId: string,
  candidate?: GoldSequenceRecord,
  excludedId?: string,
) {
  const rows = await db
    .select({
      id: goldTransactions.id,
      transactionType: goldTransactions.transactionType,
      occurredOn: goldTransactions.occurredOn,
      grams: goldTransactions.grams,
      createdAt: goldTransactions.createdAt,
    })
    .from(goldTransactions)
    .where(eq(goldTransactions.userId, userId));
  const records = rows
    .filter((row) => row.id !== excludedId)
    .map((row) => ({ ...row, grams: String(row.grams) }));
  if (candidate) records.push(candidate);
  records.sort(
    (a, b) =>
      a.occurredOn.localeCompare(b.occurredOn) ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  );

  let heldGrams = new Decimal(0);
  for (const record of records) {
    const grams = new Decimal(record.grams);
    if (record.transactionType === "BUY") {
      heldGrams = heldGrams.plus(grams);
      continue;
    }
    if (grams.gt(heldGrams)) {
      throw new ApiError(
        422,
        `Only ${heldGrams.toString()} g was available for this sale on ${record.occurredOn}.`,
        "GOLD_SEQUENCE_CONFLICT",
        { transactionId: record.id, occurredOn: record.occurredOn, availableGrams: heldGrams.toString(), requestedGrams: grams.toString() },
      );
    }
    heldGrams = heldGrams.minus(grams);
  }
}

function snapshotValues(userId: string, id: string, input: SnapshotInput, sequence: number) {
  return {
    id,
    userId,
    sequence,
    asOfDate: input.asOfDate,
    bankIdr: new Decimal(input.bankIdr).toString(),
    rdpuIdr: new Decimal(input.rdpuIdr).toString(),
    ihsgIdr: new Decimal(input.ihsgIdr).toString(),
    sp500Idr: new Decimal(input.sp500Idr).toString(),
    btcIdr: new Decimal(input.btcIdr).toString(),
    ethIdr: new Decimal(input.ethIdr).toString(),
    altcoinIdr: new Decimal(input.altcoinIdr).toString(),
    goldIdr: new Decimal(input.goldIdr).toString(),
    idrPerUsd: input.idrPerUsd ? new Decimal(input.idrPerUsd).toString() : null,
    source: input.source ?? "MANUAL",
    note: input.note || null,
  };
}

function mapSnapshot(row: SnapshotRow): PortfolioSnapshot {
  return {
    id: row.id,
    asOfDate: row.asOfDate,
    sequence: row.sequence,
    bankIdr: row.bankIdr,
    rdpuIdr: row.rdpuIdr,
    ihsgIdr: row.ihsgIdr,
    sp500Idr: row.sp500Idr,
    btcIdr: row.btcIdr,
    ethIdr: row.ethIdr,
    altcoinIdr: row.altcoinIdr,
    goldIdr: row.goldIdr,
    idrPerUsd: row.idrPerUsd ?? undefined,
    source: row.source,
    note: row.note ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function summaryFor(snapshots: PortfolioSnapshot[]) {
  const latest = snapshots.at(-1)!;
  const total = totalFor(latest);
  const previous = snapshots.at(-2);
  const increase = previous ? total.minus(totalFor(previous)) : undefined;
  const allocation = (key: keyof Pick<PortfolioSnapshot, "bankIdr" | "rdpuIdr" | "ihsgIdr" | "sp500Idr" | "btcIdr" | "ethIdr" | "altcoinIdr" | "goldIdr">) => total.gt(0) ? new Decimal(latest[key]).div(total).mul(100).toString() : "0";
  return {
    asOfDate: latest.asOfDate,
    sequence: latest.sequence,
    liquidIdr: new Decimal(latest.bankIdr).plus(latest.rdpuIdr).toString(),
    stocksIdr: new Decimal(latest.ihsgIdr).plus(latest.sp500Idr).toString(),
    cryptoIdr: new Decimal(latest.btcIdr).plus(latest.ethIdr).plus(latest.altcoinIdr).toString(),
    goldIdr: latest.goldIdr,
    totalIdr: total.toString(),
    totalUsd: latest.idrPerUsd && new Decimal(latest.idrPerUsd).gt(0) ? total.div(latest.idrPerUsd).toString() : undefined,
    increaseIdr: increase?.toString(),
    changePct: increase && previous && totalFor(previous).gt(0) ? increase.div(totalFor(previous)).mul(100).toString() : undefined,
    allocationPct: { bankIdr: allocation("bankIdr"), rdpuIdr: allocation("rdpuIdr"), ihsgIdr: allocation("ihsgIdr"), sp500Idr: allocation("sp500Idr"), btcIdr: allocation("btcIdr"), ethIdr: allocation("ethIdr"), altcoinIdr: allocation("altcoinIdr"), goldIdr: allocation("goldIdr") },
  };
}

function totalFor(snapshot: PortfolioSnapshot) {
  return new Decimal(snapshot.bankIdr).plus(snapshot.rdpuIdr).plus(snapshot.ihsgIdr).plus(snapshot.sp500Idr).plus(snapshot.btcIdr).plus(snapshot.ethIdr).plus(snapshot.altcoinIdr).plus(snapshot.goldIdr);
}

function affectedRows(result: unknown) {
  if (Array.isArray(result)) return Number((result[0] as { affectedRows?: number })?.affectedRows ?? 0);
  return Number((result as { affectedRows?: number })?.affectedRows ?? 0);
}
