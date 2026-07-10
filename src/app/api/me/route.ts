import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { json, parseJson, withUser } from "@/server/api";
import { mapProfile } from "@/server/mappers";
import { profileUpdateSchema } from "@/server/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withUser(async (_request: NextRequest, user) => {
  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  return json(mapProfile(row!));
});

export const PATCH = withUser(async (request: NextRequest, user) => {
  const input = await parseJson(request, profileUpdateSchema);
  await db.update(users).set(input).where(eq(users.id, user.id));
  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  return json(mapProfile(row!));
});
