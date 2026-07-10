import "server-only";
import Decimal from "decimal.js";
import { fetchProviderJson } from "@/server/providers/http";

interface DexPair {
  chainId?: string;
  pairAddress?: string;
  url?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string | null;
  liquidity?: { usd?: number | null };
  volume?: { h24?: number };
  priceChange?: { h24?: number };
  pairCreatedAt?: number | null;
}

export async function fetchBestDexPair(chainId: string, tokenAddress: string) {
  const url = new URL(
    `https://api.dexscreener.com/token-pairs/v1/${encodeURIComponent(chainId)}/${encodeURIComponent(tokenAddress)}`,
  );
  const pairs = await fetchProviderJson<DexPair[]>("DEX Screener", url);
  const pair = pairs
    .filter(
      (candidate) =>
        candidate.baseToken?.address?.toLowerCase() === tokenAddress.toLowerCase() &&
        candidate.priceUsd &&
        candidate.liquidity?.usd,
    )
    .sort((a, b) =>
      new Decimal(String(b.liquidity?.usd ?? 0)).cmp(String(a.liquidity?.usd ?? 0)),
    )[0];
  if (!pair) return null;
  const target = pair.baseToken;
  return {
    pairAddress: pair.pairAddress ?? "",
    pairLabel: `${pair.baseToken?.symbol ?? "TOKEN"} / ${pair.quoteToken?.symbol ?? "QUOTE"}`,
    tokenName: target?.name ?? target?.symbol ?? "Unknown token",
    tokenSymbol: target?.symbol ?? "UNKNOWN",
    priceUsd: new Decimal(pair.priceUsd!).toString(),
    liquidityUsd: new Decimal(String(pair.liquidity?.usd ?? 0)).toString(),
    volume24hUsd: new Decimal(String(pair.volume?.h24 ?? 0)).toString(),
    change24hPct: new Decimal(String(pair.priceChange?.h24 ?? 0)).toString(),
    pairCreatedAt: pair.pairCreatedAt ? new Date(pair.pairCreatedAt) : undefined,
    sourceUrl: pair.url ?? "https://dexscreener.com/",
  };
}
