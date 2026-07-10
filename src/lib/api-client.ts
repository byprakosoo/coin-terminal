"use client";

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  headers.set("accept", "application/json");
  const response = await fetch(url, {
    ...init,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => null)) as
    | { data?: T; error?: { code?: string; message?: string; details?: unknown } }
    | null;
  if (!response.ok) {
    throw new ApiClientError(
      response.status,
      payload?.error?.code ?? "REQUEST_FAILED",
      payload?.error?.message ?? `Request failed with status ${response.status}.`,
      payload?.error?.details,
    );
  }
  return payload?.data as T;
}

export function jsonBody(value: unknown) {
  return JSON.stringify(value);
}
