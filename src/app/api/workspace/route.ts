import type { NextRequest } from "next/server";
import { z } from "zod";
import { json, parseJson, withUser } from "@/server/api";
import { clearUserWorkspace } from "@/server/workspace";

const schema = z.object({ action: z.literal("CLEAR") });

export const runtime = "nodejs";

export const POST = withUser(async (request: NextRequest, user) => {
  await parseJson(request, schema);
  await clearUserWorkspace(user.id);
  return json({ cleared: true });
});
