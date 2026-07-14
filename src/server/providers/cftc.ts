import "server-only";
import { z } from "zod";
import type { CftcBtcPositioningInput } from "@/lib/btc-research-rule";
import { fetchProviderJson } from "@/server/providers/http";

export const cftcTffDatasetUrl =
  "https://publicreporting.cftc.gov/Commitments-of-Traders/TFF-Futures-Only/gpe5-46if";
export const cftcTffApiUrl = "https://publicreporting.cftc.gov/resource/gpe5-46if.json";

const numericString = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const optionalTraderCount = z.string().regex(/^\d+$/).optional();
const cftcRowSchema = z.object({
  report_date_as_yyyy_mm_dd: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
  open_interest_all: numericString,
  asset_mgr_positions_long: numericString,
  asset_mgr_positions_short: numericString,
  asset_mgr_positions_spread: numericString,
  change_in_asset_mgr_long: numericString,
  change_in_asset_mgr_short: numericString,
  traders_asset_mgr_long_all: optionalTraderCount,
  traders_asset_mgr_short_all: optionalTraderCount,
});

export async function fetchCftcBtcInstitutionalPositioning(): Promise<CftcBtcPositioningInput> {
  const url = new URL(cftcTffApiUrl);
  url.searchParams.set(
    "$select",
    [
      "report_date_as_yyyy_mm_dd",
      "open_interest_all",
      "asset_mgr_positions_long",
      "asset_mgr_positions_short",
      "asset_mgr_positions_spread",
      "change_in_asset_mgr_long",
      "change_in_asset_mgr_short",
      "traders_asset_mgr_long_all",
      "traders_asset_mgr_short_all",
    ].join(","),
  );
  url.searchParams.set("$where", "cftc_contract_market_code='133741'");
  url.searchParams.set("$order", "report_date_as_yyyy_mm_dd DESC");
  url.searchParams.set("$limit", "1");
  const payload = await fetchProviderJson<unknown>("CFTC", url, {
    headers: { "user-agent": "coin-terminal/2.1" },
    timeoutMs: 20_000,
  });
  const parsed = z.array(cftcRowSchema).min(1).safeParse(payload);
  if (!parsed.success) {
    throw new Error("CFTC did not return a complete CME Bitcoin institutional-positioning row.");
  }
  const row = parsed.data[0];
  return {
    reportDate: row.report_date_as_yyyy_mm_dd.slice(0, 10),
    openInterestContracts: row.open_interest_all,
    assetManagerLongContracts: row.asset_mgr_positions_long,
    assetManagerShortContracts: row.asset_mgr_positions_short,
    assetManagerSpreadContracts: row.asset_mgr_positions_spread,
    changeAssetManagerLongContracts: row.change_in_asset_mgr_long,
    changeAssetManagerShortContracts: row.change_in_asset_mgr_short,
    assetManagerLongTraders: row.traders_asset_mgr_long_all
      ? Number(row.traders_asset_mgr_long_all)
      : undefined,
    assetManagerShortTraders: row.traders_asset_mgr_short_all
      ? Number(row.traders_asset_mgr_short_all)
      : undefined,
  };
}
