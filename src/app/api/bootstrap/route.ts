import type { NextRequest } from "next/server";
import { json, withUser } from "@/server/api";
import { loadWorkspace } from "@/server/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withUser(async (_request: NextRequest, user) => {
  return json(await loadWorkspace(user.id));
});
