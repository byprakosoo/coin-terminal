import type { NextRequest } from "next/server";
import { json, withUser } from "@/server/api";
import { getPortfolioRecap } from "@/server/portfolio-recap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withUser(async (_request: NextRequest, user) => json(await getPortfolioRecap(user.id)));
