import { pool } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await Promise.race([
      pool.query("SELECT 1 AS healthy"),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Database health check timed out.")), 3_000),
      ),
    ]);
    return Response.json(
      { status: "ok", database: "reachable", timestamp: new Date().toISOString() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "degraded", database: "unreachable", timestamp: new Date().toISOString() },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
