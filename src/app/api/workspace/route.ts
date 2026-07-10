import type { NextRequest } from "next/server";
import { z } from "zod";
import { json, parseJson, withUser } from "@/server/api";
import { clearUserWorkspace, loadWorkspace } from "@/server/workspace";

const schema = z.object({ action: z.enum(["CLEAR", "RESET"]) });

export const runtime = "nodejs";

export const POST = withUser(async (request: NextRequest, user) => {
  const { action } = await parseJson(request, schema);
  await clearUserWorkspace(user.id, action === "RESET");
  return json(action === "RESET" ? await loadWorkspace(user.id) : { cleared: true });
});
