import "server-only";

export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    public readonly status: number | undefined,
    message: string,
  ) {
    super(message);
  }
}

export async function fetchProviderJson<T>(
  provider: string,
  url: URL,
  options: { attempts?: number; timeoutMs?: number; headers?: HeadersInit } = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json", ...options.headers },
        cache: "no-store",
        signal: AbortSignal.timeout(options.timeoutMs ?? 12_000),
      });
      if (response.ok) return (await response.json()) as T;

      const body = (await response.text()).slice(0, 500);
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === attempts - 1) {
        throw new ProviderError(
          provider,
          response.status,
          `${provider} returned ${response.status}${body ? `: ${body}` : ""}`,
        );
      }
      const retryAfter = Number(response.headers.get("retry-after"));
      await wait(
        Number.isFinite(retryAfter)
          ? Math.min(retryAfter * 1_000, 5_000)
          : Math.min(500 * 2 ** attempt, 5_000),
      );
    } catch (error) {
      lastError = error;
      if (error instanceof ProviderError) throw error;
      if (attempt === attempts - 1) break;
      await wait(Math.min(500 * 2 ** attempt, 5_000));
    }
  }

  throw new ProviderError(
    provider,
    undefined,
    lastError instanceof Error ? lastError.message : `${provider} request failed.`,
  );
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
