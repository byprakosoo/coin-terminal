import { describe, expect, it } from "vitest";
import { normalizePortfolio, normalizeSpending } from "@/components/import-wizard";
import { parseImportFile } from "@/lib/imports";

function utf16Le(value: string) {
  const bytes = new Uint8Array(2 + value.length * 2);
  bytes.set([0xff, 0xfe]);
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    bytes[2 + index * 2] = code & 0xff;
    bytes[3 + index * 2] = code >> 8;
  }
  return bytes;
}

describe("CSV normalization", () => {
  it("normalizes Money Lover debit conventions", () => {
    const result = normalizeSpending(
      { Date: "2026-07-10", Amount: "-$42.50", Direction: "debit", Category: "Dining", Account: "Card" },
      { date: "Date", amount: "Amount", direction: "Direction", category: "Category", account: "Account" },
    );
    expect(result.issues).toEqual([]);
    expect(result.spending).toMatchObject({ occurredOn: "2026-07-10", amount: "42.5", direction: "EXPENSE", category: "Dining" });
  });

  it("parses Money Lover UTF-16 tab exports with signed amounts and day-first dates", () => {
    const parsed = parseImportFile(utf16Le(
      "Id\tDate\tCategory\tAmount\tCurrency\tNote\tWallet\r\n" +
      "1\t30/06/2026\tFood & Beverage\t-25000.00\tIDR\tUbi tahu aci\tMonthly\r\n",
    ));

    expect(parsed.meta.delimiter).toBe("\t");
    expect(parsed.meta.fields).toEqual(["Id", "Date", "Category", "Amount", "Currency", "Note", "Wallet"]);
    const result = normalizeSpending(parsed.data[0], {
      date: "Date",
      amount: "Amount",
      category: "Category",
      currency: "Currency",
      note: "Note",
      account: "Wallet",
    });
    expect(result.issues).toEqual([]);
    expect(result.spending).toEqual({
      occurredOn: "2026-06-30",
      amount: "25000",
      currency: "IDR",
      direction: "EXPENSE",
      category: "Food & Beverage",
      account: "Monthly",
      note: "Ubi tahu aci",
    });
  });

  it("infers positive Money Lover amounts as income", () => {
    const result = normalizeSpending(
      { Date: "01/01/2026", Amount: "14970747.00", Category: "Salary", Currency: "IDR", Wallet: "Monthly" },
      { date: "Date", amount: "Amount", category: "Category", currency: "Currency", account: "Wallet" },
    );

    expect(result.issues).toEqual([]);
    expect(result.spending).toMatchObject({
      occurredOn: "2026-01-01",
      amount: "14970747",
      currency: "IDR",
      direction: "INCOME",
      category: "Salary",
    });
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
