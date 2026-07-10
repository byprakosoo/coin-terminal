import type { NextRequest } from "next/server";
import { handleJobRequest } from "@/server/jobs";
import { syncWalletActivity } from "@/server/jobs/wallet-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  return handleJobRequest(request, "wallet-sync", syncWalletActivity);
}
