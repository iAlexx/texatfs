/** Log fetch failures with URL, cause, and stack (LOCAL_DEBUG / TELEGRAM_DEV_LOG). */
export function logFetchFailure(
  label: string,
  url: string,
  error: unknown
): void {
  const err = error instanceof Error ? error : new Error(String(error));
  const cause =
    err.cause instanceof Error
      ? err.cause.message
      : err.cause != null
        ? String(err.cause)
        : undefined;

  console.error(`[fetch-trace] ${label} FAILED`, {
    url,
    message: err.message,
    cause,
    stack: err.stack?.split("\n").slice(0, 6).join("\n"),
  });
}

export function isFetchFailedError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg === "fetch failed" || msg.includes("fetch failed");
}
