import type { NextRequest } from "next/server";
import { handleJobRequest } from "@/server/jobs";
import { syncWalletActivity } from "@/server/jobs/wallet-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const run = (request: NextRequest) =>
  handleJobRequest(request, "wallet-sync", syncWalletActivity);

export const GET = run;
export const POST = run;
