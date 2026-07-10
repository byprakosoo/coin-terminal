import { and, desc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { walletEvents, watchlistWallets } from "@/db/schema";
import { ApiError, json, withUser } from "@/server/api";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withUser<Context>(async (_request: NextRequest, user, context) => {
  const { id } = await context.params;
  const rows = await db
    .select({ event: walletEvents })
    .from(walletEvents)
    .innerJoin(watchlistWallets, eq(watchlistWallets.id, walletEvents.watchlistWalletId))
    .where(and(eq(watchlistWallets.id, id), eq(watchlistWallets.userId, user.id)))
    .orderBy(desc(walletEvents.occurredAt));
  if (!rows.length) {
    const [wallet] = await db
      .select({ id: watchlistWallets.id })
      .from(watchlistWallets)
      .where(and(eq(watchlistWallets.id, id), eq(watchlistWallets.userId, user.id)))
      .limit(1);
    if (!wallet) throw new ApiError(404, "Wallet not found.", "NOT_FOUND");
  }
  return json(
    rows.map(({ event }) => ({
      id: event.id,
      transactionHash: event.transactionHash,
      eventType: event.eventType,
      tokenAddress: event.tokenAddress,
      tokenSymbol: event.tokenSymbol,
      tokenQuantity: event.tokenQuantity,
      valueUsd: event.valueUsd,
      occurredAt: event.occurredAt.toISOString(),
      sourceUrl: event.sourceUrl,
    })),
  );
});
