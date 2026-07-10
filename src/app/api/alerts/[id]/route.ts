import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { alerts } from "@/db/schema";
import { ApiError, json, parseJson, withUser } from "@/server/api";
import { alertPatchSchema } from "@/server/validators";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export const PATCH = withUser<Context>(async (request: NextRequest, user, context) => {
  const { id } = await context.params;
  const { read } = await parseJson(request, alertPatchSchema);
  const [existing] = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(and(eq(alerts.id, id), eq(alerts.userId, user.id)))
    .limit(1);
  if (!existing) throw new ApiError(404, "Alert not found.", "NOT_FOUND");
  const readAt = read ? new Date() : null;
  await db
    .update(alerts)
    .set({ status: read ? "READ" : "UNREAD", readAt })
    .where(and(eq(alerts.id, id), eq(alerts.userId, user.id)));
  return json({ id, readAt: readAt?.toISOString() });
});
