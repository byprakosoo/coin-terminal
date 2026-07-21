import "server-only";
import Decimal from "decimal.js";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { spendingCarryovers } from "@/db/schema";
import { createId } from "@/server/ids";
import { mapSpendingCarryover } from "@/server/mappers";

export async function upsertSpendingCarryover(
  userId: string,
  reportMonth: string,
  input: { amount: string; direction: "INCOME" | "EXPENSE"; note?: string },
) {
  const amountUsd = new Decimal(input.amount).abs().toString();
  await db
    .insert(spendingCarryovers)
    .values({
      id: createId(),
      userId,
      reportMonth,
      amountUsd,
      direction: input.direction,
      status: "ACTIVE",
      note: input.note || null,
    })
    .onDuplicateKeyUpdate({
      set: {
        amountUsd,
        direction: input.direction,
        status: "ACTIVE",
        note: input.note || null,
        updatedAt: sql`CURRENT_TIMESTAMP(3)`,
      },
    });
  const [row] = await db
    .select()
    .from(spendingCarryovers)
    .where(and(eq(spendingCarryovers.userId, userId), eq(spendingCarryovers.reportMonth, reportMonth)))
    .limit(1);
  return mapSpendingCarryover(row!);
}

export async function deleteSpendingCarryover(userId: string, reportMonth: string) {
  await db
    .insert(spendingCarryovers)
    .values({
      id: createId(),
      userId,
      reportMonth,
      amountUsd: "0",
      direction: "INCOME",
      status: "DELETED",
    })
    .onDuplicateKeyUpdate({
      set: { status: "DELETED", updatedAt: sql`CURRENT_TIMESTAMP(3)` },
    });
}
