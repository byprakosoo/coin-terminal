import { describe, expect, it } from "vitest";
import {
  resolveWalletAttestation,
  selfAttestedWalletQualityScore,
} from "@/lib/wallet-attestation";

describe("resolveWalletAttestation", () => {
  it("qualifies a user-added wallet only after explicit self-attestation", () => {
    expect(
      resolveWalletAttestation({
        currentClassification: "UNVERIFIED_WHALE",
        requestedClassification: "USER_VERIFIED",
        attestationAccepted: true,
        curatedRegistryWallet: false,
      }),
    ).toEqual({
      ok: true,
      patch: {
        classification: "USER_VERIFIED",
        qualityScore: selfAttestedWalletQualityScore,
      },
    });
  });

  it("rejects a missing ownership or control attestation", () => {
    const result = resolveWalletAttestation({
      currentClassification: "UNVERIFIED_WHALE",
      requestedClassification: "USER_VERIFIED",
      curatedRegistryWallet: false,
    });

    expect(result).toMatchObject({ ok: false, code: "ATTESTATION_REQUIRED" });
  });

  it("reverts a self-attested wallet to unverified with no evidence score", () => {
    expect(
      resolveWalletAttestation({
        currentClassification: "USER_VERIFIED",
        requestedClassification: "UNVERIFIED_WHALE",
        curatedRegistryWallet: false,
      }),
    ).toEqual({
      ok: true,
      patch: { classification: "UNVERIFIED_WHALE", qualityScore: "0" },
    });
  });

  it("keeps curated and evidence-managed classifications locked", () => {
    expect(
      resolveWalletAttestation({
        currentClassification: "EXCLUDED",
        requestedClassification: "USER_VERIFIED",
        attestationAccepted: true,
        curatedRegistryWallet: true,
      }),
    ).toMatchObject({ ok: false, code: "CURATED_WALLET_CLASSIFICATION_LOCKED" });

    expect(
      resolveWalletAttestation({
        currentClassification: "HIGH_PERFORMANCE_PROXY",
        requestedClassification: "USER_VERIFIED",
        attestationAccepted: true,
        curatedRegistryWallet: false,
      }),
    ).toMatchObject({ ok: false, code: "MANAGED_WALLET_CLASSIFICATION_LOCKED" });
  });
});
