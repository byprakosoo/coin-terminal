import type { NextRequest } from "next/server";
import { runDefensiveHistoricalValidation } from "@/server/btc-strategy";
import { handleJobRequest } from "@/server/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const run = (request: NextRequest) => handleJobRequest(request, "btc-strategy-validate", runDefensiveHistoricalValidation);
export const GET = run;
export const POST = run;
