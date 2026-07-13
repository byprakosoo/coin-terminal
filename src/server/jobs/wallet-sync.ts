import "server-only";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { walletEvents, watchlistWallets } from "@/db/schema";
import { fetchEvmTokenTransfers } from "@/server/providers/etherscan";
import { fetchBitcoinTransfers } from "@/server/providers/mempool";
import { stableId } from "@/server/ids";
import { evaluateSmartMoneyForUser } from "@/server/smart-money-engine";

export async function syncWalletActivity() {
  const wallets = await db
    .select()
    .from(watchlistWallets)
    .where(
      and(
        eq(watchlistWallets.enabled, true),
        or(
          isNull(watchlistWallets.lastCheckedAt),
          lt(watchlistWallets.lastCheckedAt, new Date(Date.now() - 15 * 60 * 1000)),
        ),
      ),
    )
    .limit(50);
  let observed = 0;
  let inserted = 0;
  let walletFailures = 0;
  const failures: Array<{ walletId: string; message: string }> = [];
  const userIds = [...new Set(wallets.map((wallet) => wallet.userId))];

  for (const wallet of wallets) {
    try {
      if (wallet.chain === "Solana") {
        throw new Error("Solana activity sync is not configured; the address remains snapshot-only.");
      }
      const transfers =
        wallet.chain === "Bitcoin"
          ? await fetchBitcoinTransfers(wallet.address)
          : await fetchEvmTokenTransfers(wallet.chain, wallet.address);
      observed += transfers.length;
      for (const transfer of transfers) {
        const id = stableId(
          wallet.id,
          `${transfer.transactionHash}:${transfer.tokenAddress}:${transfer.direction}`,
        );
        const result = await db
          .insert(walletEvents)
          .values({
            id,
            watchlistWalletId: wallet.id,
            chain: wallet.chain,
            transactionHash: transfer.transactionHash,
            eventType: transfer.direction,
            tokenAddress: transfer.tokenAddress,
            tokenSymbol: transfer.tokenSymbol,
            tokenQuantity: transfer.tokenQuantity,
            valueUsd: "0",
            occurredAt: transfer.occurredAt,
            sourceUrl: transfer.sourceUrl,
            rawPayload: transfer.rawPayload,
          })
          .onDuplicateKeyUpdate({ set: { id: sql`${walletEvents.id}` } });
        const affected = Array.isArray(result)
          ? Number((result[0] as { affectedRows?: number })?.affectedRows ?? 0)
          : 0;
        if (affected === 1) inserted += 1;
      }
      await db
        .update(watchlistWallets)
        .set({ lastCheckedAt: new Date() })
        .where(eq(watchlistWallets.id, wallet.id));
    } catch (error) {
      walletFailures += 1;
      failures.push({
        walletId: wallet.id,
        message: error instanceof Error ? error.message.slice(0, 500) : "Unknown provider error",
      });
    }

    if (wallet.chain !== "Bitcoin" && wallet.chain !== "Solana") {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  const smartMoney = [];
  for (const userId of userIds) {
    try {
      smartMoney.push({ userId, ...(await evaluateSmartMoneyForUser(userId)) });
    } catch (error) {
      failures.push({
        walletId: `smart-money:${userId}`,
        message: error instanceof Error ? error.message.slice(0, 500) : "Smart-money evaluation failed",
      });
    }
  }

  return {
    walletsChecked: wallets.length - walletFailures,
    walletsFailed: walletFailures,
    transfersObserved: observed,
    eventsInserted: inserted,
    failures,
    smartMoney,
    note: "Token transfers are stored as observed transfers; they are not mislabeled as DEX buys or sells.",
  };
}
