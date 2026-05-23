import { createLogger } from "@/lib/observability/logger";

const log = createLogger("async-retry");

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  /** Return true to retry this error. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  label?: string;
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "operation"
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${ms}ms`)),
          ms
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function retryAsync<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const shouldRetry =
    options.shouldRetry ??
    ((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      return /timeout|ECONNRESET|ENOTFOUND|502|503|504|network|unreachable/i.test(
        msg
      );
    });

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts || !shouldRetry(err, attempt)) throw err;
      const delay = baseDelayMs * attempt;
      log.warn("retry scheduled", {
        label: options.label,
        attempt,
        maxAttempts,
        delayMs: delay,
        error: err instanceof Error ? err.message : String(err),
      });
      await sleep(delay);
    }
  }
  throw lastError;
}

/** Fire-and-forget wrapper — logs + optional callback, never throws. */
export async function safeAsync(
  fn: () => Promise<void>,
  context: { scope: string; label: string; onError?: (err: unknown) => void }
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    log.error(`${context.label} failed`, {
      scope: context.scope,
      error: err instanceof Error ? err.message : String(err),
    });
    context.onError?.(err);
  }
}

const recentKeys = new Map<string, number>();

/** Returns false when the same key was seen within ttlMs (dedup guard). */
export function oncePerKey(key: string, ttlMs: number): boolean {
  const now = Date.now();
  const prev = recentKeys.get(key);
  if (prev !== undefined && now - prev < ttlMs) return false;
  recentKeys.set(key, now);

  if (recentKeys.size > 2000) {
    for (const [k, ts] of recentKeys) {
      if (now - ts > ttlMs) recentKeys.delete(k);
    }
  }
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
