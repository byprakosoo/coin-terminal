import type { NextRequest } from "next/server";
import { json, withUser } from "@/server/api";
import { listImports } from "@/server/import-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withUser(async (_request: NextRequest, user) => {
  return json(await listImports(user.id));
});
