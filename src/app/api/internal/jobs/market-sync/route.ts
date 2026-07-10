import type { NextRequest } from "next/server";
import { handleJobRequest } from "@/server/jobs";
import { syncMarketData } from "@/server/jobs/market-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  return handleJobRequest(request, "market-sync", syncMarketData);
}
