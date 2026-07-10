import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { db } from "@/db";
import { apiRateLimits } from "@/db/schema";
import { auth } from "@/lib/auth";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "API_ERROR",
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface RequestUser {
  id: string;
  email: string;
  name: string;
}

type AuthedHandler<Context = unknown> = (
  request: NextRequest,
  user: RequestUser,
  context: Context,
) => Promise<Response>;

export function withUser<Context = unknown>(handler: AuthedHandler<Context>) {
  return async (request: NextRequest, context: Context) => {
    try {
      assertSameOrigin(request);
      const session = await auth.api.getSession({ headers: request.headers });

      if (!session) {
        throw new ApiError(401, "Authentication is required.", "UNAUTHORIZED");
      }

      return await handler(
        request,
        { id: session.user.id, email: session.user.email, name: session.user.name },
        context,
      );
    } catch (error) {
      return apiErrorResponse(error);
    }
  };
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      { status: error.status },
    );
  }

  if (error && typeof error === "object" && "code" in error) {
    const code = String(error.code);
    if (code === "ER_DUP_ENTRY") {
      return NextResponse.json(
        { error: { code: "CONFLICT", message: "This record already exists." } },
        { status: 409 },
      );
    }
  }

  console.error("Unhandled API error", error);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "The request could not be completed." } },
    { status: 500 },
  );
}

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ApiError(415, "Content-Type must be application/json.", "UNSUPPORTED_MEDIA_TYPE");
  }

  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.", "INVALID_JSON");
  }

  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(422, "Request validation failed.", "VALIDATION_ERROR", parsed.error.flatten());
  }

  return parsed.data;
}

export function json<T>(data: T, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  if (!headers.has("cache-control")) headers.set("cache-control", "private, no-store");
  return NextResponse.json({ data }, { ...init, headers });
}

export async function enforceRateLimit(
  key: string,
  options: { limit: number; windowMs: number },
) {
  const now = Date.now();
  const windowStartedAt = new Date(Math.floor(now / options.windowMs) * options.windowMs);
  const expiresAt = new Date(windowStartedAt.getTime() + options.windowMs);

  await db
    .insert(apiRateLimits)
    .values({
      rateKey: key,
      windowStartedAt,
      requestCount: 1,
      expiresAt,
    })
    .onDuplicateKeyUpdate({
      set: { requestCount: sql`${apiRateLimits.requestCount} + 1` },
    });

  const [window] = await db
    .select({ requestCount: apiRateLimits.requestCount })
    .from(apiRateLimits)
    .where(
      and(
        eq(apiRateLimits.rateKey, key),
        eq(apiRateLimits.windowStartedAt, windowStartedAt),
      ),
    )
    .limit(1);

  if ((window?.requestCount ?? 0) > options.limit) {
    throw new ApiError(429, "Too many requests. Try again later.", "RATE_LIMITED", {
      retryAfterSeconds: Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000)),
    });
  }
}

function assertSameOrigin(request: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;

  const origin = request.headers.get("origin");
  if (!origin) return;

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    throw new ApiError(403, "The request origin is invalid.", "INVALID_ORIGIN");
  }

  if (originUrl.host !== request.nextUrl.host || originUrl.protocol !== request.nextUrl.protocol) {
    throw new ApiError(403, "Cross-origin mutation requests are not allowed.", "INVALID_ORIGIN");
  }
}
