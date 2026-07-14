import { describe, expect, it } from "vitest";
import { walletPatchSchema } from "@/server/validators";

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
