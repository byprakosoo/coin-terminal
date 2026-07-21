import "server-only";
import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  importBatches,
  importRows,
  portfolioTransactions,
  spendingTransactions,
} from "@/db/schema";
import {
  normalizePortfolio,
  normalizeSpending,
  parseImportFile,
  type ImportKind,
  type ImportMapping,
} from "@/lib/imports";
import { ApiError } from "@/server/api";
import { createId, fingerprint } from "@/server/ids";
import { findLedgerSequenceIssue } from "@/server/ledger-validation";
import { mapImportBatch, mapPortfolioTransaction } from "@/server/mappers";

const requiredMappings = {
  spending: ["date", "amount"],
  portfolio: ["asset", "type", "quantity", "price", "date"],
} as const;

export async function previewImport(input: {
  userId: string;
  kind: ImportKind;
  file: File;
  mapping: ImportMapping;
  reportMonth?: string;
}) {
  validateFile(input.file);
  for (const field of requiredMappings[input.kind]) {
    if (!input.mapping[field]) {
      throw new ApiError(422, `Required mapping is missing: ${field}.`, "VALIDATION_ERROR");
    }
  }
  if (input.kind === "spending" && !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.reportMonth ?? "")) {
    throw new ApiError(422, "Choose a valid report month before importing.", "VALIDATION_ERROR");
  }

  const contents = await input.file.arrayBuffer();
  const checksum = createHash("sha256").update(new Uint8Array(contents)).digest("hex");
  const parsed = parseImportFile(contents);
  if (!parsed.data.length) {
    throw new ApiError(422, parsed.errors[0]?.message ?? "No CSV rows were found.", "INVALID_CSV");
  }
  if (parsed.data.length > 5_000) {
    throw new ApiError(422, "Imports are limited to 5,000 rows per batch.", "ROW_LIMIT_EXCEEDED");
  }

  const source = input.kind === "spending" ? "MONEY_LOVER" : "PORTFOLIO_CSV";
  const existingFingerprints = await loadFingerprints(input.userId, input.kind);
  const seen = new Set<string>();
  const rows = parsed.data.map((raw, index) => {
    const normalized =
      input.kind === "spending"
        ? normalizeSpending(raw, input.mapping)
        : normalizePortfolio(raw, input.mapping);
    const rowFingerprint = fingerprint(input.userId, [normalized.fingerprintValue]);
    const status = normalized.issues.length
      ? ("INVALID" as const)
      : existingFingerprints.has(rowFingerprint) || seen.has(rowFingerprint)
        ? ("DUPLICATE" as const)
        : ("ACCEPTED" as const);
    seen.add(rowFingerprint);
    return {
      id: createId(),
      rowNumber: index + 2,
      status,
      fingerprint: rowFingerprint,
      normalized: normalized.spending
        ? { ...normalized.spending, display: normalized.display }
        : normalized.portfolio
          ? { ...normalized.portfolio, display: normalized.display }
          : { display: normalized.display },
      issues: normalized.issues,
    };
  });
  const counts = {
    accepted: rows.filter((row) => row.status === "ACCEPTED").length,
    duplicate: rows.filter((row) => row.status === "DUPLICATE").length,
    invalid: rows.filter((row) => row.status === "INVALID").length,
  };
  const acceptedMonths = input.kind === "spending"
    ? Array.from(
      rows.reduce((months, row) => {
        if (row.status !== "ACCEPTED") return months;
        const occurredOn = String((row.normalized as Record<string, unknown>).occurredOn ?? "");
        const month = occurredOn.slice(0, 7);
        if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) months.set(month, (months.get(month) ?? 0) + 1);
        return months;
      }, new Map<string, number>()),
    )
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, accepted]) => ({ month, accepted }))
    : [];
  const batchId = createId();

  await db.transaction(async (tx) => {
    await tx.insert(importBatches).values({
      id: batchId,
      userId: input.userId,
      source,
      status: "PREVIEW",
      fileName: input.file.name,
      checksum,
      reportMonth: input.kind === "spending" ? input.reportMonth : null,
      mapping: input.mapping,
      acceptedRows: counts.accepted,
      duplicateRows: counts.duplicate,
      invalidRows: counts.invalid,
    });
    for (let offset = 0; offset < rows.length; offset += 500) {
      await tx.insert(importRows).values(
        rows.slice(offset, offset + 500).map((row) => ({
          ...row,
          batchId,
          normalized: row.normalized as Record<string, unknown>,
        })),
      );
    }
  });

  return {
    batchId,
    fileName: input.file.name,
    source,
    ...counts,
    acceptedMonths,
    rows: rows.slice(0, 200).map((row) => ({
      rowNumber: row.rowNumber,
      status: row.status,
      fingerprint: row.fingerprint,
      display: (row.normalized.display as string[]) ?? [],
      issues: row.issues,
    })),
    truncated: rows.length > 200,
  };
}

export async function confirmImport(userId: string, batchId: string) {
  const [batch] = await db
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.id, batchId), eq(importBatches.userId, userId)))
    .limit(1);
  if (!batch) throw new ApiError(404, "Import batch not found.", "NOT_FOUND");
  if (batch.status !== "PREVIEW") {
    throw new ApiError(409, "Only preview batches can be confirmed.", "INVALID_IMPORT_STATE");
  }

  const staged = await db
    .select()
    .from(importRows)
    .where(and(eq(importRows.batchId, batchId), eq(importRows.status, "ACCEPTED")));

  if (batch.source === "PORTFOLIO_CSV") {
    const existing = await db
      .select()
      .from(portfolioTransactions)
      .where(eq(portfolioTransactions.userId, userId));
    const candidate = [
      ...existing.map(mapPortfolioTransaction),
      ...staged.map((row) => {
        const item = row.normalized as Record<string, unknown>;
        return {
          id: row.id,
          assetSymbol: String(item.assetSymbol),
          transactionType: item.transactionType as
            | "BUY"
            | "SELL"
            | "TRANSFER_IN"
            | "TRANSFER_OUT"
            | "REWARD"
            | "AIRDROP"
            | "FEE",
          quantity: String(item.quantity),
          unitPriceUsd: String(item.unitPriceUsd),
          feeUsd: String(item.feeUsd),
          venue: String(item.venue),
          executedAt: String(item.executedAt),
          note: item.note ? String(item.note) : undefined,
          fingerprint: row.fingerprint ?? undefined,
        };
      }),
    ];
    const issue = findLedgerSequenceIssue(candidate);
    if (issue) {
      throw new ApiError(
        422,
        `Import would overdraw ${issue.assetSymbol} at ${issue.executedAt}.`,
        "INSUFFICIENT_BALANCE",
        issue,
      );
    }
  }

  await db.transaction(async (tx) => {
    if (batch.source === "MONEY_LOVER") {
      const values = staged.map((row) => {
        const item = row.normalized as Record<string, unknown>;
        return {
          id: createId(),
          userId,
          importBatchId: batchId,
          occurredOn: String(item.occurredOn),
          reportMonth: batch.reportMonth ?? String(item.occurredOn).slice(0, 7),
          amount: new Decimal(String(item.amount)).abs().toString(),
          currency: item.currency as "USD" | "IDR" | "EUR",
          direction: item.direction as "INCOME" | "EXPENSE",
          category: String(item.category),
          account: String(item.account),
          note: item.note ? String(item.note) : null,
          fingerprint: row.fingerprint!,
        };
      });
      for (let offset = 0; offset < values.length; offset += 500) {
        await tx.insert(spendingTransactions).values(values.slice(offset, offset + 500));
      }
    } else {
      const values = staged.map((row) => {
        const item = row.normalized as Record<string, unknown>;
        const quantity = String(item.quantity);
        const unitPriceUsd = String(item.unitPriceUsd);
        return {
          id: createId(),
          userId,
          importBatchId: batchId,
          assetSymbol: String(item.assetSymbol),
          transactionType: item.transactionType as
            | "BUY"
            | "SELL"
            | "TRANSFER_IN"
            | "TRANSFER_OUT"
            | "REWARD"
            | "AIRDROP"
            | "FEE",
          quantity,
          unitPriceUsd,
          totalValueUsd: new Decimal(quantity).mul(unitPriceUsd).toString(),
          feeUsd: String(item.feeUsd),
          venue: String(item.venue),
          note: item.note ? String(item.note) : null,
          executedAt: new Date(String(item.executedAt)),
          fingerprint: row.fingerprint!,
        };
      });
      for (let offset = 0; offset < values.length; offset += 500) {
        await tx.insert(portfolioTransactions).values(values.slice(offset, offset + 500));
      }
    }

    await tx
      .update(importBatches)
      .set({ status: "CONFIRMED", confirmedAt: new Date() })
      .where(and(eq(importBatches.id, batchId), eq(importBatches.userId, userId)));
  });

  const [confirmed] = await db
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.id, batchId), eq(importBatches.userId, userId)))
    .limit(1);
  return mapImportBatch(confirmed!);
}

export async function listImports(userId: string) {
  const rows = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.userId, userId))
    .orderBy(sql`${importBatches.createdAt} desc`);
  return rows.map(mapImportBatch);
}

async function loadFingerprints(userId: string, kind: ImportKind) {
  if (kind === "spending") {
    const rows = await db
      .select({ fingerprint: spendingTransactions.fingerprint })
      .from(spendingTransactions)
      .where(eq(spendingTransactions.userId, userId));
    return new Set(rows.flatMap((row) => (row.fingerprint ? [row.fingerprint] : [])));
  }
  const rows = await db
    .select({ fingerprint: portfolioTransactions.fingerprint })
    .from(portfolioTransactions)
    .where(eq(portfolioTransactions.userId, userId));
  return new Set(rows.flatMap((row) => (row.fingerprint ? [row.fingerprint] : [])));
}

function validateFile(file: File) {
  if (file.size > 10 * 1024 * 1024) {
    throw new ApiError(413, "CSV files must be 10 MB or smaller.", "FILE_TOO_LARGE");
  }
  if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
    throw new ApiError(415, "Choose a CSV file.", "INVALID_FILE_TYPE");
  }
}
