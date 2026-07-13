import Decimal from "decimal.js";
import { z } from "zod";

const decimal = (options: { positive?: boolean; nonnegative?: boolean } = {}) =>
  z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine((value) => {
      try {
        const number = new Decimal(value);
        if (!number.isFinite()) return false;
        if (options.positive && !number.gt(0)) return false;
        if (options.nonnegative && number.isNegative()) return false;
        return true;
      } catch {
        return false;
      }
    }, "Enter a valid decimal value.");

const isoDate = z.string().datetime({ offset: true }).transform((value) => new Date(value));

export const profileUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, "Enter a valid IANA timezone."),
    displayCurrency: z.enum(["USD", "IDR", "EUR"]),
    disclaimerAccepted: z.literal(true).optional(),
    onboardingComplete: z.boolean().optional(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one profile field.");

export const portfolioTransactionSchema = z
  .object({
    assetSymbol: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,20}$/),
    transactionType: z.enum([
      "BUY",
      "SELL",
      "TRANSFER_IN",
      "TRANSFER_OUT",
      "REWARD",
      "AIRDROP",
      "FEE",
    ]),
    quantity: decimal({ nonnegative: true }),
    unitPriceUsd: decimal({ nonnegative: true }),
    feeUsd: decimal({ nonnegative: true }).default("0"),
    venue: z.string().trim().min(1).max(160).default("Manual"),
    executedAt: isoDate,
    note: z.string().trim().max(5_000).optional(),
  })
  .superRefine((value, context) => {
    if (value.transactionType !== "FEE" && !new Decimal(value.quantity).gt(0)) {
      context.addIssue({ code: "custom", path: ["quantity"], message: "Quantity must be positive." });
    }
    if (["BUY", "SELL"].includes(value.transactionType) && !new Decimal(value.unitPriceUsd).gt(0)) {
      context.addIssue({
        code: "custom",
        path: ["unitPriceUsd"],
        message: "BUY and SELL records require a positive execution price.",
      });
    }
  });

export const spendingTransactionSchema = z.object({
  occurredOn: z.iso.date(),
  amount: decimal({ positive: true }),
  currency: z.enum(["USD", "IDR", "EUR"]),
  direction: z.enum(["INCOME", "EXPENSE"]),
  category: z.string().trim().min(1).max(160).default("Uncategorized"),
  account: z.string().trim().min(1).max(160).default("Manual"),
  note: z.string().trim().max(5_000).optional(),
});

export const walletSchema = z.object({
  chain: z.enum(["Bitcoin", "Ethereum", "Solana", "Base", "Arbitrum"]),
  address: z.string().trim().min(20).max(128),
  label: z.string().trim().min(1).max(160),
});

export const walletPatchSchema = z
  .object({
    label: z.string().trim().min(1).max(160).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

export const alertPatchSchema = z.object({ read: z.boolean() });

export const conversationSchema = z.object({
  title: z.string().trim().min(1).max(255).default("New conversation"),
});

export const assistantMessageSchema = z.object({
  content: z.string().trim().min(1).max(8_000),
});

export function assertWalletAddress(chain: string, address: string) {
  const valid =
    chain === "Bitcoin"
      ? /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{20,70}$/.test(address)
      : chain === "Solana"
        ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
        : /^0x[a-fA-F0-9]{40}$/.test(address);

  if (!valid) {
    throw new Error(`Enter a valid ${chain} public address.`);
  }
}
