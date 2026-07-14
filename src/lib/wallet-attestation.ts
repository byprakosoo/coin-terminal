import type { WalletClassification } from "@/lib/types";

export const selfAttestedWalletQualityScore = "50";

type SelfAttestableClassification = "USER_VERIFIED" | "UNVERIFIED_WHALE";

interface WalletAttestationInput {
  currentClassification: WalletClassification;
  requestedClassification: SelfAttestableClassification;
  attestationAccepted?: true;
  curatedRegistryWallet: boolean;
}

type WalletAttestationResult =
  | {
      ok: true;
      patch: {
        classification: SelfAttestableClassification;
        qualityScore: string;
      };
    }
  | {
      ok: false;
      code:
        | "ATTESTATION_REQUIRED"
        | "CURATED_WALLET_CLASSIFICATION_LOCKED"
        | "MANAGED_WALLET_CLASSIFICATION_LOCKED";
      message: string;
    };

/**
 * Resolves the only classification transition exposed to an authenticated user.
 * The neutral score records attestation evidence only; it is not a performance score.
 */
export function resolveWalletAttestation(
  input: WalletAttestationInput,
): WalletAttestationResult {
  if (input.curatedRegistryWallet) {
    return {
      ok: false,
      code: "CURATED_WALLET_CLASSIFICATION_LOCKED",
      message: "Curated registry classifications cannot be changed by workspace users.",
    };
  }

  if (!isSelfAttestable(input.currentClassification)) {
    return {
      ok: false,
      code: "MANAGED_WALLET_CLASSIFICATION_LOCKED",
      message: "This wallet classification is managed by reviewed evidence and cannot be self-attested.",
    };
  }

  if (input.requestedClassification === "USER_VERIFIED" && input.attestationAccepted !== true) {
    return {
      ok: false,
      code: "ATTESTATION_REQUIRED",
      message: "Confirm that you own or control this public address before saving a self-attestation.",
    };
  }

  return {
    ok: true,
    patch: {
      classification: input.requestedClassification,
      qualityScore:
        input.requestedClassification === "USER_VERIFIED"
          ? selfAttestedWalletQualityScore
          : "0",
    },
  };
}

function isSelfAttestable(
  classification: WalletClassification,
): classification is SelfAttestableClassification {
  return classification === "USER_VERIFIED" || classification === "UNVERIFIED_WHALE";
}
