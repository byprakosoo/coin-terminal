import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { mapProfile } from "@/server/mappers";

export async function getServerSessionProfile() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user) return null;
  return { session, profile: mapProfile(user) };
}
