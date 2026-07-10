import "server-only";
import Decimal from "decimal.js";
import { fetchProviderJson } from "@/server/providers/http";

interface MempoolTransaction {
  txid: string;
  vin: Array<{ prevout?: { scriptpubkey_address?: string; value?: number } }>;
  vout: Array<{ scriptpubkey_address?: string; value?: number }>;
  status: { confirmed?: boolean; block_time?: number };
}

export async function fetchBitcoinTransfers(address: string) {
  const url = new URL(
    `https://mempool.space/api/address/${encodeURIComponent(address)}/txs`,
  );
  const transactions = await fetchProviderJson<MempoolTransaction[]>("mempool.space", url, {
    attempts: 2,
  });
  return transactions.map((transaction) => {
    const received = transaction.vout
      .filter((output) => output.scriptpubkey_address === address)
      .reduce((total, output) => total.add(output.value ?? 0), new Decimal(0));
    const sent = transaction.vin
      .filter((input) => input.prevout?.scriptpubkey_address === address)
      .reduce((total, input) => total.add(input.prevout?.value ?? 0), new Decimal(0));
    const netSats = received.sub(sent);
    return {
      transactionHash: transaction.txid,
      direction: netSats.gte(0) ? ("TRANSFER_IN" as const) : ("TRANSFER_OUT" as const),
      tokenAddress: "native:bitcoin",
      tokenName: "Bitcoin",
      tokenSymbol: "BTC",
      tokenQuantity: netSats.abs().div(100_000_000).toString(),
      occurredAt: transaction.status.block_time
        ? new Date(transaction.status.block_time * 1_000)
        : new Date(),
      sourceUrl: `https://mempool.space/tx/${transaction.txid}`,
      rawPayload: { ...transaction },
    };
  });
}
