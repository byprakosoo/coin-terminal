import { describe, expect, it } from "vitest";
import { normalizePortfolio, normalizeSpending } from "@/components/import-wizard";

describe("CSV normalization", () => {
  it("normalizes Money Lover debit conventions", () => {
    const result = normalizeSpending(
      { Date: "2026-07-10", Amount: "-$42.50", Direction: "debit", Category: "Dining", Account: "Card" },
      { date: "Date", amount: "Amount", direction: "Direction", category: "Category", account: "Account" },
    );
    expect(result.issues).toEqual([]);
    expect(result.spending).toMatchObject({ occurredOn: "2026-07-10", amount: "42.5", direction: "EXPENSE", category: "Dining" });
  });

  it("rejects missing portfolio fields", () => {
    const result = normalizePortfolio(
      { Asset: "", Type: "swap", Quantity: "oops", Price: "100", Date: "not-a-date" },
      { asset: "Asset", type: "Type", quantity: "Quantity", price: "Price", date: "Date" },
    );
    expect(result.portfolio).toBeUndefined();
    expect(result.issues).toEqual(expect.arrayContaining(["Invalid asset symbol", "Unknown transaction type", "Invalid quantity", "Invalid date"]));
  });
});
