import "server-only";
import Decimal from "decimal.js";
import { env } from "@/lib/env";
import { fetchProviderJson } from "@/server/providers/http";

const chainIds = { Ethereum: "1", Base: "8453", Arbitrum: "42161" } as const;
const explorers = {
  Ethereum: "https://etherscan.io",
  Base: "https://basescan.org",
  Arbitrum: "https://arbiscan.io",
} as const;

interface TokenTransfer {
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  contractAddress: string;
  value: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
}

interface EtherscanResponse {
  status: string;
  message: string;
  result: TokenTransfer[] | string;
}

export async function fetchEvmTokenTransfers(
  chain: keyof typeof chainIds,
  address: string,
) {
  if (!env.etherscanApiKey) return [];
  const url = new URL("https://api.etherscan.io/v2/api");
  url.searchParams.set("chainid", chainIds[chain]);
  url.searchParams.set("module", "account");
  url.searchParams.set("action", "tokentx");
  url.searchParams.set("address", address);
  url.searchParams.set("page", "1");
  url.searchParams.set("offset", "100");
  url.searchParams.set("sort", "desc");
  url.searchParams.set("apikey", env.etherscanApiKey);
  const response = await fetchProviderJson<EtherscanResponse>("Etherscan", url, { attempts: 2 });
  if (response.status === "0") {
    if (response.message === "No transactions found") return [];
    throw new Error(`Etherscan: ${String(response.result)}`);
  }
  if (!Array.isArray(response.result)) return [];
  return response.result.map((transfer) => ({
    transactionHash: transfer.hash,
    direction:
      transfer.to.toLowerCase() === address.toLowerCase()
        ? ("TRANSFER_IN" as const)
        : ("TRANSFER_OUT" as const),
    tokenAddress: transfer.contractAddress.toLowerCase(),
    tokenName: transfer.tokenName,
    tokenSymbol: transfer.tokenSymbol,
    tokenQuantity: new Decimal(transfer.value)
      .div(new Decimal(10).pow(Number(transfer.tokenDecimal || 0)))
      .toString(),
    occurredAt: new Date(Number(transfer.timeStamp) * 1_000),
    sourceUrl: `${explorers[chain]}/tx/${transfer.hash}`,
    rawPayload: { ...transfer },
  }));
}
