import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCftcBtcInstitutionalPositioning } from "@/server/providers/cftc";

const cftcRow = {
  report_date_as_yyyy_mm_dd: "2026-07-07T00:00:00.000",
  open_interest_all: "18832",
  asset_mgr_positions_long: "4790",
  asset_mgr_positions_short: "2405",
  asset_mgr_positions_spread: "129",
  change_in_asset_mgr_long: "36",
  change_in_asset_mgr_short: "-349",
  traders_asset_mgr_long_all: "7",
  traders_asset_mgr_short_all: "10",
};

afterEach(() => vi.unstubAllGlobals());

describe("fetchCftcBtcInstitutionalPositioning", () => {
  it("requests and normalizes the latest official CME Bitcoin TFF row", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      void url;
      return new Response(JSON.stringify([cftcRow]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetcher);

    await expect(fetchCftcBtcInstitutionalPositioning()).resolves.toEqual({
      reportDate: "2026-07-07",
      openInterestContracts: "18832",
      assetManagerLongContracts: "4790",
      assetManagerShortContracts: "2405",
      assetManagerSpreadContracts: "129",
      changeAssetManagerLongContracts: "36",
      changeAssetManagerShortContracts: "-349",
      assetManagerLongTraders: 7,
      assetManagerShortTraders: 10,
    });
    const requestedUrl = new URL(String(fetcher.mock.calls[0][0]));
    expect(requestedUrl.hostname).toBe("publicreporting.cftc.gov");
    expect(requestedUrl.searchParams.get("$where")).toContain("133741");
    expect(requestedUrl.searchParams.get("$limit")).toBe("1");
  });

  it("rejects incomplete official rows instead of filling missing positions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify([{ ...cftcRow, asset_mgr_positions_long: undefined }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(fetchCftcBtcInstitutionalPositioning()).rejects.toThrow(
      "complete CME Bitcoin institutional-positioning row",
    );
  });
});
