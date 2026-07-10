import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { alerts } from "@/db/schema";
import { json, withUser } from "@/server/api";
import { loadWorkspace } from "@/server/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withUser(async (_request: NextRequest, user) => {
  return json((await loadWorkspace(user.id)).alerts);
});

export const PATCH = withUser(async (_request: NextRequest, user) => {
  const now = new Date();
  await db
    .update(alerts)
    .set({ status: "READ", readAt: now })
    .where(eq(alerts.userId, user.id));
  return json({ readAt: now.toISOString() });
});
