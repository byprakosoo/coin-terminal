import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { watchlistWallets } from "@/db/schema";
import { ApiError } from "@/server/api";
import { createId } from "@/server/ids";
import { getTrackedWalletMetadata } from "@/lib/tracked-wallets";
import { resolveWalletAttestation } from "@/lib/wallet-attestation";
import { mapWallet } from "@/server/mappers";
import type { walletPatchSchema, walletSchema } from "@/server/validators";
import type { z } from "zod";

type WalletInput = z.infer<typeof walletSchema>;
type WalletPatch = z.infer<typeof walletPatchSchema>;

export async function createWallet(userId: string, input: WalletInput) {
  validateAddress(input.chain, input.address);
  const id = createId();
  await db.insert(watchlistWallets).values({
    id,
    userId,
    chain: input.chain,
    address: normalizedAddress(input.chain, input.address),
    label: input.label,
    classification: "UNVERIFIED_WHALE",
    qualityScore: "0",
    enabled: true,
  });
  const [row] = await db
    .select()
    .from(watchlistWallets)
    .where(and(eq(watchlistWallets.id, id), eq(watchlistWallets.userId, userId)))
    .limit(1);
  return mapWallet(row!);
}

export async function updateWallet(userId: string, walletId: string, input: WalletPatch) {
  const [existing] = await db
    .select({
      id: watchlistWallets.id,
      chain: watchlistWallets.chain,
      address: watchlistWallets.address,
      classification: watchlistWallets.classification,
    })
    .from(watchlistWallets)
    .where(and(eq(watchlistWallets.id, walletId), eq(watchlistWallets.userId, userId)))
    .limit(1);
  if (!existing) throw new ApiError(404, "Wallet not found.", "NOT_FOUND");

  const updates: {
    label?: string;
    enabled?: boolean;
    classification?: "USER_VERIFIED" | "UNVERIFIED_WHALE";
    qualityScore?: string;
  } = {};
  if (input.label !== undefined) updates.label = input.label;
  if (input.enabled !== undefined) updates.enabled = input.enabled;
  if (input.classification !== undefined) {
    const result = resolveWalletAttestation({
      currentClassification: existing.classification,
      requestedClassification: input.classification,
      attestationAccepted: input.attestationAccepted,
      curatedRegistryWallet: Boolean(
        getTrackedWalletMetadata(existing.chain, existing.address),
      ),
    });
    if (!result.ok) {
      throw new ApiError(
        result.code === "ATTESTATION_REQUIRED" ? 422 : 409,
        result.message,
        result.code,
      );
    }
    Object.assign(updates, result.patch);
  }

  await db
    .update(watchlistWallets)
    .set(updates)
    .where(and(eq(watchlistWallets.id, walletId), eq(watchlistWallets.userId, userId)));
  const [row] = await db
    .select()
    .from(watchlistWallets)
    .where(and(eq(watchlistWallets.id, walletId), eq(watchlistWallets.userId, userId)))
    .limit(1);
  return mapWallet(row!);
}

export async function deleteWallet(userId: string, walletId: string) {
  const result = await db
    .delete(watchlistWallets)
    .where(and(eq(watchlistWallets.id, walletId), eq(watchlistWallets.userId, userId)));
  if (!affectedRows(result)) throw new ApiError(404, "Wallet not found.", "NOT_FOUND");
}

function validateAddress(chain: WalletInput["chain"], address: string) {
  const valid =
    chain === "Bitcoin"
      ? /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{20,70}$/.test(address)
      : chain === "Solana"
        ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
        : /^0x[a-fA-F0-9]{40}$/.test(address);
  if (!valid) {
    throw new ApiError(422, `Enter a valid ${chain} public address.`, "INVALID_WALLET_ADDRESS");
  }
}

function normalizedAddress(chain: WalletInput["chain"], address: string) {
  return chain === "Bitcoin" || chain === "Solana" ? address : address.toLowerCase();
}

function affectedRows(result: unknown) {
  if (Array.isArray(result)) return Number((result[0] as { affectedRows?: number })?.affectedRows ?? 0);
  return Number((result as { affectedRows?: number })?.affectedRows ?? 0);
}
