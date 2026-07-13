import { describe, expect, it } from "vitest";
import { trackedWhaleWallets, walletExplorerUrl } from "@/lib/tracked-wallets";
import { assertWalletAddress } from "@/server/validators";

describe("tracked whale wallets", () => {
  it("contains five unique addresses for each requested chain", () => {
    expect(trackedWhaleWallets).toHaveLength(15);
    expect(new Set(trackedWhaleWallets.map((wallet) => `${wallet.chain}:${wallet.address}`)).size)
      .toBe(15);

    for (const chain of ["Bitcoin", "Ethereum", "Solana"] as const) {
      const wallets = trackedWhaleWallets.filter((wallet) => wallet.chain === chain);
      expect(wallets).toHaveLength(5);
      expect(wallets.map((wallet) => wallet.holderRank)).toEqual([1, 2, 3, 4, 5]);
      expect(wallets.map((wallet) => wallet.sourceRank)).toEqual(
        chain === "Ethereum" ? [3, 4, 5, 8, 9] : [1, 2, 3, 4, 5],
      );
      wallets.forEach((wallet) => expect(() => assertWalletAddress(chain, wallet.address)).not.toThrow());
    }
  });

  it("keeps custodial addresses out of qualified trading signals", () => {
    const custodial = trackedWhaleWallets.filter((wallet) => wallet.entityType.includes("Custodian"));
    expect(custodial.length).toBeGreaterThan(0);
    custodial.forEach((wallet) => expect(wallet.classification).toBe("EXCLUDED"));
  });

  it("builds a Solana explorer URL without changing the case-sensitive address", () => {
    const wallet = trackedWhaleWallets.find((item) => item.chain === "Solana")!;
    expect(walletExplorerUrl(wallet.chain, wallet.address)).toContain(wallet.address);
  });
});
