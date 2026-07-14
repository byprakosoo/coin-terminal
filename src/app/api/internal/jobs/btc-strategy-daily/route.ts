import type { NextRequest } from "next/server";
import { generateBtcDailySignals } from "@/server/btc-strategy";
import { handleJobRequest } from "@/server/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const run = (request: NextRequest) => handleJobRequest(request, "btc-strategy-daily", generateBtcDailySignals);
export const GET = run;
export const POST = run;
