import type { LogContext } from "@/lib/observability/logger";

let sentryReady = false;
let initAttempted = false;

async function ensureSentry(): Promise<boolean> {
  if (initAttempted) return sentryReady;
  initAttempted = true;

  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return false;

  try {
    const Sentry = await import("@sentry/node");
    if (!Sentry.isInitialized?.()) {
      Sentry.init({
        dsn,
        environment: process.env.SENTRY_ENVIRONMENT ?? process.env.RAILWAY_ENVIRONMENT ?? "production",
        tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.05),
        enabled: true,
      });
    }
    sentryReady = true;
  } catch {
    sentryReady = false;
  }
  return sentryReady;
}

/** Capture runtime errors — no-op when SENTRY_DSN is unset. */
export async function captureError(
  error: unknown,
  context?: LogContext & { tags?: Record<string, string> }
): Promise<void> {
  const ready = await ensureSentry();
  if (!ready) return;

  try {
    const Sentry = await import("@sentry/node");
    Sentry.withScope((scope) => {
      if (context?.scope) scope.setTag("scope", context.scope);
      if (context?.requestId) scope.setTag("requestId", context.requestId);
      if (context?.tags) {
        for (const [k, v] of Object.entries(context.tags)) {
          scope.setTag(k, v);
        }
      }
      const extra = { ...context };
      delete extra.scope;
      delete extra.requestId;
      delete extra.tags;
      if (Object.keys(extra).length > 0) scope.setExtras(extra);
      Sentry.captureException(error);
    });
  } catch {
    /* never throw from observability */
  }
}
