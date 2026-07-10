import type { NextRequest } from "next/server";
import { handleJobRequest } from "@/server/jobs";
import { evaluateAllSmartMoney } from "@/server/jobs/smart-money-evaluate";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  return handleJobRequest(request, "smart-money-evaluate", evaluateAllSmartMoney);
}
