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

const defaultedText = (defaultValue: string, maxLength: number) =>
  z.preprocess(
    (value) => typeof value === "string" && !value.trim() ? undefined : value,
    z.string().trim().min(1).max(maxLength).default(defaultValue),
  );

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
    displayCurrency: z.enum(["USD", "IDR"]),
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
  category: defaultedText("Uncategorized", 160),
  account: defaultedText("Manual", 160),
  note: z.string().trim().max(5_000).optional(),
});

export const spendingMonthSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must use YYYY-MM format."),
});

export const spendingTransactionIdsSchema = z.object({
  ids: z
    .array(z.string().uuid())
    .min(1, "Select at least one transaction.")
    .max(5_000, "A maximum of 5,000 transactions can be deleted at once.")
    .refine((ids) => new Set(ids).size === ids.length, "Transaction IDs must be unique."),
});

export const spendingDeleteSchema = z.union([spendingMonthSchema, spendingTransactionIdsSchema]);

export const spendingCarryoverSchema = z.object({
  amount: decimal({ positive: true }),
  direction: z.enum(["INCOME", "EXPENSE"]),
  note: z.string().trim().max(5_000).optional(),
});

const recapDecimal = decimal({ nonnegative: true });

/** Payload accepted by the Income History snapshot endpoints. */
export const portfolioRecapSnapshotSchema = z.object({
  asOfDate: z.iso.date(),
  bankIdr: recapDecimal,
  rdpuIdr: recapDecimal,
  ihsgIdr: recapDecimal,
  sp500Idr: recapDecimal,
  btcIdr: recapDecimal,
  ethIdr: recapDecimal,
  altcoinIdr: recapDecimal,
  goldIdr: recapDecimal,
  idrPerUsd: recapDecimal.optional(),
  source: z.enum(["MANUAL", "HYBRID_PREFILL", "XLSX_IMPORT"]).optional(),
  note: z.string().trim().max(5_000).optional(),
});

export const goldTransactionSchema = z.object({
  transactionType: z.enum(["BUY", "SELL"]),
  occurredOn: z.iso.date(),
  goldType: z.string().trim().min(1, "Enter the gold type.").max(120),
  grams: decimal({ positive: true }),
  unitPriceIdr: decimal({ positive: true }),
  venue: z.string().trim().max(160).optional(),
  note: z.string().trim().max(5_000).optional(),
});

export const goldValuationSchema = z.object({
  asOfDate: z.iso.date(),
  pricePerGramIdr: decimal({ positive: true }),
  source: z.enum(["MANUAL", "XLSX_IMPORT"]).optional(),
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
    classification: z.enum(["USER_VERIFIED", "UNVERIFIED_WHALE"]).optional(),
    attestationAccepted: z.literal(true).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.label === undefined &&
      value.enabled === undefined &&
      value.classification === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "Provide at least one wallet field to update.",
      });
    }
    if (value.classification === "USER_VERIFIED" && value.attestationAccepted !== true) {
      context.addIssue({
        code: "custom",
        path: ["attestationAccepted"],
        message: "Ownership or control attestation is required.",
      });
    }
    if (value.attestationAccepted && value.classification !== "USER_VERIFIED") {
      context.addIssue({
        code: "custom",
        path: ["attestationAccepted"],
        message: "Attestation is only accepted with the self-attested classification.",
      });
    }
  });

export const alertPatchSchema = z.object({ read: z.boolean() });

export const btcStrategyBudgetSchema = z.object({
  sleeveBudgetUsd: decimal({ positive: true }),
});

export const signalReconciliationSchema = z
  .object({
    status: z.enum(["EXECUTED", "SKIPPED"]),
    actualPriceUsd: decimal({ positive: true }).optional(),
    actualQuantityBtc: decimal({ positive: true }).optional(),
    actualFeeUsd: decimal({ nonnegative: true }).optional(),
    executedAt: isoDate.optional(),
  })
  .superRefine((value, context) => {
    if (value.status !== "EXECUTED") return;
    if (!value.actualPriceUsd) context.addIssue({ code: "custom", path: ["actualPriceUsd"], message: "Execution price is required." });
    if (!value.actualQuantityBtc) context.addIssue({ code: "custom", path: ["actualQuantityBtc"], message: "BTC quantity is required." });
  });

export const conversationSchema = z.object({
  title: z.string().trim().min(1).max(255).default("New conversation"),
});

export const assistantMessageSchema = z.object({
  content: z.string().trim().min(1).max(8_000),
});

export const aiModelConfigSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(120),
  provider: z.enum(["OPENAI", "ANTHROPIC", "KIMI", "OPENAI_COMPATIBLE"]),
  model: z.string().trim().min(1).max(180),
  endpointUrl: z.string().trim().max(500).optional(),
  apiKey: z.preprocess(
    (value) => typeof value === "string" && !value.trim() ? undefined : value,
    z.string().trim().min(1).max(4_000).optional(),
  ),
});

export const aiModelActivationSchema = z.object({
  active: z.boolean(),
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
