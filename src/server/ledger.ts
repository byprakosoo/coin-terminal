import "server-only";
import Decimal from "decimal.js";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { portfolioTransactions, spendingTransactions } from "@/db/schema";
import { ApiError } from "@/server/api";
import { createId, fingerprint } from "@/server/ids";
import { mapPortfolioTransaction, mapSpendingTransaction } from "@/server/mappers";
import { findLedgerSequenceIssue } from "@/server/ledger-validation";
import type {
  portfolioTransactionSchema,
  spendingTransactionSchema,
} from "@/server/validators";
import type { z } from "zod";

type PortfolioInput = z.infer<typeof portfolioTransactionSchema>;
type SpendingInput = z.infer<typeof spendingTransactionSchema>;

export async function listPortfolioTransactions(userId: string) {
  const rows = await db
    .select()
    .from(portfolioTransactions)
    .where(eq(portfolioTransactions.userId, userId))
    .orderBy(desc(portfolioTransactions.executedAt));
  return rows.map(mapPortfolioTransaction);
}

export async function createPortfolioTransaction(userId: string, input: PortfolioInput) {
  await assertSufficientBalance(userId, input);
  const row = portfolioValues(userId, createId(), input);
  await db.insert(portfolioTransactions).values(row);
  const [created] = await db
    .select()
    .from(portfolioTransactions)
    .where(and(eq(portfolioTransactions.id, row.id), eq(portfolioTransactions.userId, userId)))
    .limit(1);
  if (!created) throw new ApiError(500, "The transaction was not created.");
  return mapPortfolioTransaction(created);
}

export async function updatePortfolioTransaction(
  userId: string,
  transactionId: string,
  input: PortfolioInput,
) {
  const [existing] = await db
    .select()
    .from(portfolioTransactions)
    .where(
      and(eq(portfolioTransactions.id, transactionId), eq(portfolioTransactions.userId, userId)),
    )
    .limit(1);
  if (!existing) throw new ApiError(404, "Portfolio transaction not found.", "NOT_FOUND");

  await assertSufficientBalance(userId, input, transactionId);
  const values = portfolioValues(userId, transactionId, input);
  await db
    .update(portfolioTransactions)
    .set(values)
    .where(
      and(eq(portfolioTransactions.id, transactionId), eq(portfolioTransactions.userId, userId)),
    );
  const [updated] = await db
    .select()
    .from(portfolioTransactions)
    .where(
      and(eq(portfolioTransactions.id, transactionId), eq(portfolioTransactions.userId, userId)),
    )
    .limit(1);
  return mapPortfolioTransaction(updated!);
}

export async function deletePortfolioTransaction(userId: string, transactionId: string) {
  const transactions = await listPortfolioTransactions(userId);
  if (!transactions.some((transaction) => transaction.id === transactionId)) {
    throw new ApiError(404, "Portfolio transaction not found.", "NOT_FOUND");
  }
  const issue = findLedgerSequenceIssue(
    transactions.filter((transaction) => transaction.id !== transactionId),
  );
  if (issue) {
    throw new ApiError(
      422,
      `Delete later outbound ${issue.assetSymbol} records before removing this funding record.`,
      "LEDGER_SEQUENCE_CONFLICT",
      issue,
    );
  }
  const result = await db
    .delete(portfolioTransactions)
    .where(
      and(eq(portfolioTransactions.id, transactionId), eq(portfolioTransactions.userId, userId)),
    );
  if (!affectedRows(result)) throw new ApiError(409, "The transaction changed before deletion.", "CONFLICT");
}

export async function listSpendingTransactions(userId: string) {
  const rows = await db
    .select()
    .from(spendingTransactions)
    .where(eq(spendingTransactions.userId, userId))
    .orderBy(desc(spendingTransactions.occurredOn));
  return rows.map(mapSpendingTransaction);
}

export async function createSpendingTransaction(userId: string, input: SpendingInput) {
  const row = spendingValues(userId, createId(), input);
  await db.insert(spendingTransactions).values(row);
  const [created] = await db
    .select()
    .from(spendingTransactions)
    .where(and(eq(spendingTransactions.id, row.id), eq(spendingTransactions.userId, userId)))
    .limit(1);
  if (!created) throw new ApiError(500, "The spending transaction was not created.");
  return mapSpendingTransaction(created);
}

export async function updateSpendingTransaction(
  userId: string,
  transactionId: string,
  input: SpendingInput,
) {
  const [existing] = await db
    .select({ id: spendingTransactions.id })
    .from(spendingTransactions)
    .where(
      and(eq(spendingTransactions.id, transactionId), eq(spendingTransactions.userId, userId)),
    )
    .limit(1);
  if (!existing) throw new ApiError(404, "Spending transaction not found.", "NOT_FOUND");
  const values = spendingValues(userId, transactionId, input);
  await db
    .update(spendingTransactions)
    .set(values)
    .where(
      and(eq(spendingTransactions.id, transactionId), eq(spendingTransactions.userId, userId)),
    );
  const [updated] = await db
    .select()
    .from(spendingTransactions)
    .where(
      and(eq(spendingTransactions.id, transactionId), eq(spendingTransactions.userId, userId)),
    )
    .limit(1);
  return mapSpendingTransaction(updated!);
}

export async function deleteSpendingTransaction(userId: string, transactionId: string) {
  const result = await db
    .delete(spendingTransactions)
    .where(
      and(eq(spendingTransactions.id, transactionId), eq(spendingTransactions.userId, userId)),
    );
  if (!affectedRows(result)) {
    throw new ApiError(404, "Spending transaction not found.", "NOT_FOUND");
  }
}

function portfolioValues(userId: string, transactionId: string, input: PortfolioInput) {
  const executedAt = input.executedAt.toISOString();
  return {
    id: transactionId,
    userId,
    assetSymbol: input.assetSymbol,
    transactionType: input.transactionType,
    quantity: new Decimal(input.quantity).toString(),
    unitPriceUsd: new Decimal(input.unitPriceUsd).toString(),
    totalValueUsd: new Decimal(input.quantity).mul(input.unitPriceUsd).toString(),
    feeUsd: new Decimal(input.feeUsd).toString(),
    venue: input.venue,
    note: input.note || null,
    executedAt: input.executedAt,
    fingerprint: fingerprint(userId, [
      input.assetSymbol,
      input.transactionType,
      input.quantity,
      input.unitPriceUsd,
      executedAt,
      input.feeUsd,
    ]),
  };
}

function spendingValues(userId: string, transactionId: string, input: SpendingInput) {
  return {
    id: transactionId,
    userId,
    occurredOn: input.occurredOn,
    amount: new Decimal(input.amount).abs().toString(),
    currency: input.currency,
    direction: input.direction,
    category: input.category,
    account: input.account,
    note: input.note || null,
    fingerprint: fingerprint(userId, [
      input.occurredOn,
      input.amount,
      input.direction,
      input.category,
      input.account,
      input.note,
    ]),
  };
}

async function assertSufficientBalance(
  userId: string,
  input: PortfolioInput,
  excludedId?: string,
) {
  const transactions = await listPortfolioTransactions(userId);
  const candidate = [
    ...transactions.filter((transaction) => transaction.id !== excludedId),
    {
      id: excludedId ?? "candidate",
      assetSymbol: input.assetSymbol,
      transactionType: input.transactionType,
      quantity: input.quantity,
      unitPriceUsd: input.unitPriceUsd,
      feeUsd: input.feeUsd,
      venue: input.venue,
      executedAt: input.executedAt.toISOString(),
      note: input.note,
    },
  ];
  const issue = findLedgerSequenceIssue(candidate);
  if (issue) {
    throw new ApiError(
      422,
      `Only ${issue.availableQuantity} ${issue.assetSymbol} was available at ${issue.executedAt}.`,
      "INSUFFICIENT_BALANCE",
      issue,
    );
  }
}

function affectedRows(result: unknown) {
  if (Array.isArray(result)) return Number((result[0] as { affectedRows?: number })?.affectedRows ?? 0);
  return Number((result as { affectedRows?: number })?.affectedRows ?? 0);
}
