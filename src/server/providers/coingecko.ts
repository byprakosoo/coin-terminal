import "server-only";
import Decimal from "decimal.js";
import { fetchProviderJson } from "@/server/providers/http";

const baseUrl = "https://api.coingecko.com/api/v3";
const coins = {
  bitcoin: { symbol: "BTC", name: "Bitcoin" },
  ethereum: { symbol: "ETH", name: "Ethereum" },
  solana: { symbol: "SOL", name: "Solana" },
} as const;

interface SimplePriceResponse {
  [coin: string]: {
    usd?: number;
    usd_24h_change?: number | null;
    last_updated_at?: number;
  };
}

interface MarketChartResponse {
  prices?: Array<[number, number]>;
  market_caps?: Array<[number, number]>;
  total_volumes?: Array<[number, number]>;
}

export async function fetchCryptoTickers() {
  const url = new URL(`${baseUrl}/simple/price`);
  url.searchParams.set("ids", Object.keys(coins).join(","));
  url.searchParams.set("vs_currencies", "usd");
  url.searchParams.set("include_24hr_change", "true");
  url.searchParams.set("include_last_updated_at", "true");
  url.searchParams.set("precision", "full");
  const response = await fetchProviderJson<SimplePriceResponse>("CoinGecko", url);

  return Object.entries(coins).map(([coinId, metadata]) => {
    const value = response[coinId];
    if (!value?.usd || !value.last_updated_at) {
      throw new Error(`CoinGecko did not return a complete ${metadata.symbol} ticker.`);
    }
    return {
      coinId,
      assetSymbol: metadata.symbol,
      name: metadata.name,
      priceUsd: new Decimal(String(value.usd)).toString(),
      dailyChangePct: new Decimal(String(value.usd_24h_change ?? 0)).toString(),
      observedAt: new Date(value.last_updated_at * 1_000),
    };
  });
}

export async function fetchBtcDailyPrices(days = 90) {
  const url = new URL(`${baseUrl}/coins/bitcoin/market_chart`);
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("days", String(days));
  url.searchParams.set("interval", "daily");
  url.searchParams.set("precision", "full");
  const response = await fetchProviderJson<MarketChartResponse>("CoinGecko", url);
  if (!response.prices?.length) throw new Error("CoinGecko returned no BTC daily prices.");

  const byDate = new Map<string, { date: string; close: string; observedAt: Date }>();
  for (const [milliseconds, price] of response.prices) {
    const observedAt = new Date(milliseconds);
    const date = observedAt.toISOString().slice(0, 10);
    byDate.set(date, { date, close: new Decimal(String(price)).toString(), observedAt });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
