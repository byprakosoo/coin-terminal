import Decimal from "decimal.js";
import type { PortfolioTransaction } from "@/lib/types";

export interface LedgerSequenceIssue {
  transactionId: string;
  assetSymbol: string;
  executedAt: string;
  requestedQuantity: string;
  availableQuantity: string;
}

export function findLedgerSequenceIssue(
  transactions: PortfolioTransaction[],
): LedgerSequenceIssue | undefined {
  const balances = new Map<string, Decimal>();
  const sorted = [...transactions].sort(
    (a, b) =>
      new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime() ||
      a.id.localeCompare(b.id),
  );
  for (const transaction of sorted) {
    const available = balances.get(transaction.assetSymbol) ?? new Decimal(0);
    const amount = new Decimal(transaction.quantity || 0);
    if (["BUY", "TRANSFER_IN", "REWARD", "AIRDROP"].includes(transaction.transactionType)) {
      balances.set(transaction.assetSymbol, available.add(amount));
      continue;
    }
    if (["SELL", "TRANSFER_OUT"].includes(transaction.transactionType)) {
      if (amount.gt(available)) {
        return {
          transactionId: transaction.id,
          assetSymbol: transaction.assetSymbol,
          executedAt: transaction.executedAt,
          requestedQuantity: amount.toString(),
          availableQuantity: available.toString(),
        };
      }
      balances.set(transaction.assetSymbol, available.sub(amount));
    }
  }
  return undefined;
}
