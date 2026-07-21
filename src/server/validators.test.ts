import { describe, expect, it } from "vitest";
import { spendingTransactionSchema, walletPatchSchema } from "@/server/validators";

describe("spendingTransactionSchema", () => {
  it("accepts income and defaults blank category and account fields", () => {
    const result = spendingTransactionSchema.safeParse({
      occurredOn: "2026-07-21",
      amount: "1000000",
      currency: "IDR",
      direction: "INCOME",
      category: " ",
      account: "",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.category).toBe("Uncategorized");
    expect(result.data.account).toBe("Manual");
  });
});

describe("walletPatchSchema", () => {
  it("accepts an explicit self-attestation", () => {
    expect(
      walletPatchSchema.safeParse({
        classification: "USER_VERIFIED",
        attestationAccepted: true,
      }).success,
    ).toBe(true);
  });

  it("requires attestation for USER_VERIFIED", () => {
    expect(
      walletPatchSchema.safeParse({ classification: "USER_VERIFIED" }).success,
    ).toBe(false);
  });

  it("allows removing self-attestation without repeating it", () => {
    expect(
      walletPatchSchema.safeParse({ classification: "UNVERIFIED_WHALE" }).success,
    ).toBe(true);
  });

  it("rejects managed classifications and direct quality-score writes", () => {
    expect(
      walletPatchSchema.safeParse({ classification: "PUBLICLY_ATTRIBUTED" }).success,
    ).toBe(false);
    expect(walletPatchSchema.safeParse({ qualityScore: "100" }).success).toBe(false);
  });
});
