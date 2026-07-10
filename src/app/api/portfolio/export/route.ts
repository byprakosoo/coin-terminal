import type { NextRequest } from "next/server";
import { withUser } from "@/server/api";
import { listPortfolioTransactions } from "@/server/ledger";

export const runtime = "nodejs";

export const GET = withUser(async (_request: NextRequest, user) => {
  const rows = await listPortfolioTransactions(user.id);
  const headers = [
    "asset_symbol",
    "transaction_type",
    "quantity",
    "unit_price_usd",
    "fee_usd",
    "venue",
    "executed_at",
    "note",
  ];
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      [
        row.assetSymbol,
        row.transactionType,
        row.quantity,
        row.unitPriceUsd,
        row.feeUsd,
        row.venue,
        row.executedAt,
        row.note ?? "",
      ]
        .map(csvCell)
        .join(","),
    ),
  ].join("\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="coin-terminal-portfolio-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "private, no-store",
    },
  });
});

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
