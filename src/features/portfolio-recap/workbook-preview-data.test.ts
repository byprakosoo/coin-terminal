import { describe, expect, it } from "vitest";
import { computeSnapshotBreakdown } from "./recap-calc";
import { createWorkbookAnnualRows, createWorkbookGold, createWorkbookSnapshots } from "./workbook-preview-data";

describe("workbook preview data", () => {
  it("uses the latest Income History row as the current net worth", () => {
    const snapshots = createWorkbookSnapshots();
    const latest = snapshots.at(-1);

    expect(snapshots).toHaveLength(65);
    expect(latest?.asOfDate).toBe("2026-06-16");
    expect(latest?.source).toBe("XLSX_IMPORT");
    expect(computeSnapshotBreakdown(latest!).totalIdr).toBe("857015707");
    expect(computeSnapshotBreakdown(latest!).goldIdr).toBe("69165000");
  });

  it("matches the workbook Gold and Annual Recap outputs", () => {
    const gold = createWorkbookGold();
    const annual = createWorkbookAnnualRows();

    expect(gold.transactions).toHaveLength(15);
    expect(gold.summary.heldGrams).toBe("26.5");
    expect(gold.summary.marketValueIdr).toBe("69165000");
    expect(gold.summary.remainingCostBasisIdr).toBe("56476000");
    expect(annual.at(-1)).toMatchObject({ year: 2026, netWorthIdr: "940637392" });
  });
});
