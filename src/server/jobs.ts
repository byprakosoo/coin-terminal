import "server-only";
import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { jobRuns } from "@/db/schema";
import { env } from "@/lib/env";
import { ApiError, apiErrorResponse, json } from "@/server/api";
import { createId } from "@/server/ids";

export async function handleJobRequest<T>(
  request: NextRequest,
  jobName: string,
  runner: () => Promise<T>,
) {
  try {
    authorizeCron(request);
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length > 255) {
      throw new ApiError(
        422,
        "A valid Idempotency-Key header is required.",
        "IDEMPOTENCY_KEY_REQUIRED",
      );
    }

    const id = createId();
    try {
      await db.insert(jobRuns).values({
        id,
        jobName,
        idempotencyKey,
        status: "RUNNING",
      });
    } catch (error) {
      if (!isDuplicate(error)) throw error;
      const [existing] = await db
        .select()
        .from(jobRuns)
        .where(
          and(eq(jobRuns.jobName, jobName), eq(jobRuns.idempotencyKey, idempotencyKey)),
        )
        .limit(1);
      return json({
        duplicate: true,
        job: existing
          ? {
              id: existing.id,
              status: existing.status,
              startedAt: existing.startedAt.toISOString(),
              completedAt: existing.completedAt?.toISOString(),
              result: existing.resultSummary,
            }
          : null,
      });
    }

    try {
      const result = await runner();
      await db
        .update(jobRuns)
        .set({
          status: "SUCCEEDED",
          completedAt: new Date(),
          resultSummary: result as Record<string, unknown>,
        })
        .where(eq(jobRuns.id, id));
      return json({ duplicate: false, jobId: id, result });
    } catch (error) {
      await db
        .update(jobRuns)
        .set({
          status: "FAILED",
          completedAt: new Date(),
          errorMessage: error instanceof Error ? error.message.slice(0, 10_000) : "Unknown job error",
        })
        .where(eq(jobRuns.id, id));
      throw error;
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}

function authorizeCron(request: NextRequest) {
  if (!env.cronSecret) {
    throw new ApiError(503, "CRON_SECRET is not configured.", "JOB_AUTH_NOT_CONFIGURED");
  }
  if (request.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    throw new ApiError(401, "Job authentication failed.", "UNAUTHORIZED");
  }
}

function isDuplicate(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ER_DUP_ENTRY");
}
