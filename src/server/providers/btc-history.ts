import "server-only";
import Decimal from "decimal.js";
import type { StrategyCandle } from "@/lib/btc-defensive-strategy";
import { fetchProviderJson } from "@/server/providers/http";

const dayMs = 86_400_000;
const coinbaseStart = "2015-07-20";
const binanceStart = "2017-08-17";

type CoinbaseRow = [number, number, number, number, number, number];
type BinanceRow = [number, string, string, string, string, string, number, ...unknown[]];

export interface BtcHistoryDataset {
  source: "Coinbase" | "Binance";
  sourceUrl: string;
  candles: StrategyCandle[];
}

export async function fetchCoinbaseBtcDailyCandles(options: { fullHistory?: boolean; days?: number } = {}) {
  const endDate = lastCompletedUtcDate();
  const startDate = options.fullHistory
    ? coinbaseStart
    : shiftDate(endDate, -(options.days ?? 400) + 1);
  const byDate = new Map<string, StrategyCandle>();

  for (let cursor = startDate; cursor <= endDate; cursor = shiftDate(cursor, 280)) {
    const pageEnd = minDate(shiftDate(cursor, 279), endDate);
    const url = new URL("https://api.exchange.coinbase.com/products/BTC-USD/candles");
    url.searchParams.set("granularity", "86400");
    url.searchParams.set("start", `${cursor}T00:00:00Z`);
    url.searchParams.set("end", `${shiftDate(pageEnd, 1)}T00:00:00Z`);
    const rows = await fetchProviderJson<CoinbaseRow[]>("Coinbase", url, {
      headers: { "user-agent": "coin-terminal/2.0" },
      timeoutMs: 20_000,
    });
    for (const [seconds, low, high, open, close, volume] of rows) {
      const date = new Date(seconds * 1_000).toISOString().slice(0, 10);
      if (date < startDate || date > endDate) continue;
      byDate.set(date, normalizeCandle(date, open, high, low, close, volume));
    }
  }
  return [...byDate.values()].sort(byCandleDate);
}

export async function fetchBinanceBtcDailyCandles(options: { fullHistory?: boolean; days?: number } = {}) {
  const endDate = lastCompletedUtcDate();
  const requestedStart = options.fullHistory
    ? binanceStart
    : shiftDate(endDate, -(options.days ?? 400) + 1);
  const startDate = requestedStart < binanceStart ? binanceStart : requestedStart;
  const byDate = new Map<string, StrategyCandle>();
  let startTime = Date.parse(`${startDate}T00:00:00Z`);
  const endTime = Date.parse(`${shiftDate(endDate, 1)}T00:00:00Z`) - 1;

  while (startTime <= endTime) {
    const url = new URL("https://data-api.binance.vision/api/v3/klines");
    url.searchParams.set("symbol", "BTCUSDT");
    url.searchParams.set("interval", "1d");
    url.searchParams.set("startTime", String(startTime));
    url.searchParams.set("endTime", String(endTime));
    url.searchParams.set("limit", "1000");
    const rows = await fetchProviderJson<BinanceRow[]>("Binance", url, { timeoutMs: 20_000 });
    if (!rows.length) break;
    for (const [openedAt, open, high, low, close, volume] of rows) {
      const date = new Date(openedAt).toISOString().slice(0, 10);
      if (date <= endDate) byDate.set(date, normalizeCandle(date, open, high, low, close, volume));
    }
    const next = Number(rows.at(-1)![0]) + dayMs;
    if (next <= startTime) break;
    startTime = next;
  }
  return [...byDate.values()].sort(byCandleDate);
}

export async function fetchBtcHistoryDatasets(fullHistory = false): Promise<BtcHistoryDataset[]> {
  const [coinbase, binance] = await Promise.all([
    fetchCoinbaseBtcDailyCandles({ fullHistory }),
    fetchBinanceBtcDailyCandles({ fullHistory }),
  ]);
  return [
    { source: "Coinbase", sourceUrl: "https://exchange.coinbase.com/trade/BTC-USD", candles: coinbase },
    { source: "Binance", sourceUrl: "https://www.binance.com/en/trade/BTC_USDT", candles: binance },
  ];
}

export function buildConsensusCandles(datasets: BtcHistoryDataset[]) {
  const maps = datasets.map((dataset) => new Map(dataset.candles.map((candle) => [candle.date, candle])));
  const sharedDates = datasets[0]?.candles
    .map((candle) => candle.date)
    .filter((date) => maps.every((map) => map.has(date))) ?? [];
  return sharedDates.map((date) => {
    const rows = maps.map((map) => map.get(date)!);
    const close = median(rows.map((row) => new Decimal(row.close)));
    const reference = rows[0];
    return {
      ...reference,
      close: close.toString(),
      high: Decimal.max(new Decimal(reference.high), close).toString(),
      low: Decimal.min(new Decimal(reference.low), close).toString(),
    } satisfies StrategyCandle;
  });
}

export function consensusDeviationPct(datasets: BtcHistoryDataset[], date: string) {
  const closes = datasets
    .map((dataset) => dataset.candles.find((candle) => candle.date === date)?.close)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Decimal(value));
  if (closes.length < 2) return undefined;
  const center = median(closes);
  return Decimal.max(...closes.map((value) => value.sub(center).abs().div(center).mul(100)));
}

export function lastCompletedUtcDate(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - dayMs)
    .toISOString()
    .slice(0, 10);
}

function normalizeCandle(date: string, open: Decimal.Value, high: Decimal.Value, low: Decimal.Value, close: Decimal.Value, volume: Decimal.Value): StrategyCandle {
  return {
    date,
    open: new Decimal(open).toString(),
    high: new Decimal(high).toString(),
    low: new Decimal(low).toString(),
    close: new Decimal(close).toString(),
    volume: new Decimal(volume).toString(),
  };
}

function median(values: Decimal[]) {
  const sorted = [...values].sort((left, right) => left.comparedTo(right));
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : sorted[middle - 1].add(sorted[middle]).div(2);
}

function shiftDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * dayMs).toISOString().slice(0, 10);
}

function minDate(left: string, right: string) {
  return left < right ? left : right;
}

function byCandleDate(left: StrategyCandle, right: StrategyCandle) {
  return left.date.localeCompare(right.date);
}
