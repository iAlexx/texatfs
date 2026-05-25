/**
 * Resilient Puppeteer wrapper — retry, classify, alert, observe.
 *
 * Retry strategy:
 *   • TIMEOUT, NETWORK_ERROR, SESSION_CRASHED, UNKNOWN → exponential backoff (max 3 retries)
 *   • CLOUDFLARE_BLOCK, DETECTION_RISK → immediate fail + admin Telegram alert
 *   • LOGIN_FAILED → immediate fail (bad credentials, no point retrying)
 *
 * Every attempt is logged with full context (user, action, attempt #, error type).
 * After final failure, a PuppeteerResilienceError is thrown with classification.
 */
import { createLogger } from "@/lib/observability/logger";
import {
  classifyPuppeteerError,
  isAlertWorthy,
  isRetryable,
  PuppeteerClassifiedError,
  type PuppeteerErrorType,
} from "@/lib/texas/puppeteer-errors";
import {
  getAdminTelegramIds,
  sendTelegramMessage,
} from "@/lib/telegram/bot-api";

const log = createLogger("texas/puppeteer-resilience");

const DEFAULT_MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 2_000;
const BACKOFF_JITTER_MS = 500;

export class PuppeteerResilienceError extends PuppeteerClassifiedError {
  constructor(
    message: string,
    readonly errorType: PuppeteerErrorType,
    readonly attempts: number,
    readonly originalError?: Error,
    readonly context?: Record<string, unknown>
  ) {
    super(message, errorType, originalError, context);
    this.name = "PuppeteerResilienceError";
  }
}

export interface ResilienceOptions {
  userId?: string;
  maxRetries?: number;
  /** Override which error types are retryable for this invocation. */
  retryableOverride?: (type: PuppeteerErrorType) => boolean;
}

// ── In-process sync status (singleton) ──────────────────────────────────────

interface PuppeteerSyncStatus {
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorType: PuppeteerErrorType | null;
  lastErrorMessage: string | null;
  lastContext: string | null;
  totalAttempts: number;
  totalFailures: number;
  totalSuccesses: number;
}

const syncStatus: PuppeteerSyncStatus = {
  lastSuccessAt: null,
  lastErrorAt: null,
  lastErrorType: null,
  lastErrorMessage: null,
  lastContext: null,
  totalAttempts: 0,
  totalFailures: 0,
  totalSuccesses: 0,
};

export function getPuppeteerSyncStatus(): Readonly<PuppeteerSyncStatus> {
  return { ...syncStatus };
}

// ── Backoff helper ──────────────────────────────────────────────────────────

function backoffMs(attempt: number): number {
  const base = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
  const jitter = Math.floor(Math.random() * BACKOFF_JITTER_MS);
  return base + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Admin alerting ──────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function alertAdmins(opts: {
  errorType: PuppeteerErrorType;
  error: string;
  context: string;
  userId?: string;
  attempt: number;
  maxRetries: number;
}): Promise<void> {
  const admins = getAdminTelegramIds();
  if (!admins.length) {
    log.warn("no admin Telegram IDs configured for alert", {
      errorType: opts.errorType,
    });
    return;
  }

  const emoji = opts.errorType === "CLOUDFLARE_BLOCK" ? "🛡️" : "🚨";
  const lines = [
    `${emoji} <b>Puppeteer Alert — ${opts.errorType}</b>`,
    "",
    `<b>Context:</b> ${escapeHtml(opts.context)}`,
    opts.userId ? `<b>User:</b> <code>${escapeHtml(opts.userId)}</code>` : null,
    `<b>Attempt:</b> ${opts.attempt}/${opts.maxRetries + 1}`,
    "",
    `<b>Error:</b>`,
    `<code>${escapeHtml(opts.error.slice(0, 600))}</code>`,
    "",
    opts.errorType === "CLOUDFLARE_BLOCK"
      ? "⚠️ Cloudflare is blocking the scraper. Proxy rotation or manual intervention required."
      : opts.errorType === "DETECTION_RISK"
        ? "⚠️ Bot detection triggered. Review stealth settings and user agent."
        : `⚠️ ${opts.maxRetries + 1} attempts exhausted. Manual check recommended.`,
  ];

  const text = lines.filter(Boolean).join("\n");

  for (const chatId of admins) {
    try {
      await sendTelegramMessage(chatId, text, { parse_mode: "HTML" });
    } catch (e) {
      log.warn("failed to send admin alert", {
        chatId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

// ── Core resilience wrapper ─────────────────────────────────────────────────

/**
 * Execute a Puppeteer operation with automatic retry, error classification,
 * structured logging, and admin alerting.
 *
 * @param fn        The async Puppeteer operation.
 * @param context   Human-readable label for logs (e.g. "texasBrowserSignIn").
 * @param options   Optional user/retry overrides.
 */
export async function withPuppeteerResilience<T>(
  fn: () => Promise<T>,
  context: string,
  options?: ResilienceOptions
): Promise<T> {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const shouldRetry = options?.retryableOverride ?? isRetryable;
  let lastError: PuppeteerClassifiedError | undefined;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    syncStatus.totalAttempts++;

    log.info("puppeteer attempt starting", {
      context,
      attempt,
      maxAttempts: maxRetries + 1,
      userId: options?.userId,
    });

    const started = Date.now();

    try {
      const result = await fn();

      syncStatus.lastSuccessAt = new Date().toISOString();
      syncStatus.totalSuccesses++;

      log.info("puppeteer attempt succeeded", {
        context,
        attempt,
        durationMs: Date.now() - started,
        userId: options?.userId,
      });

      return result;
    } catch (err) {
      const durationMs = Date.now() - started;
      const errorType = classifyPuppeteerError(err);
      const original = err instanceof Error ? err : new Error(String(err));

      lastError = new PuppeteerClassifiedError(
        original.message,
        errorType,
        original,
        { context, userId: options?.userId, attempt }
      );

      syncStatus.lastErrorAt = new Date().toISOString();
      syncStatus.lastErrorType = errorType;
      syncStatus.lastErrorMessage = original.message.slice(0, 500);
      syncStatus.lastContext = context;
      syncStatus.totalFailures++;

      log.error("puppeteer attempt failed", {
        context,
        attempt,
        maxAttempts: maxRetries + 1,
        errorType,
        retryable: shouldRetry(errorType),
        durationMs,
        userId: options?.userId,
        error: original.message.slice(0, 500),
      });

      // Non-retryable → immediate alert + throw
      if (!shouldRetry(errorType)) {
        if (isAlertWorthy(errorType)) {
          await alertAdmins({
            errorType,
            error: original.message,
            context,
            userId: options?.userId,
            attempt,
            maxRetries,
          });
        }
        throw new PuppeteerResilienceError(
          `[${errorType}] ${original.message}`,
          errorType,
          attempt,
          original,
          { context, userId: options?.userId }
        );
      }

      // Last attempt exhausted → alert + throw
      if (attempt > maxRetries) {
        await alertAdmins({
          errorType,
          error: original.message,
          context,
          userId: options?.userId,
          attempt,
          maxRetries,
        });
        break;
      }

      // Backoff before next attempt
      const delay = backoffMs(attempt);
      log.warn("puppeteer retrying after backoff", {
        context,
        attempt,
        nextAttempt: attempt + 1,
        backoffMs: delay,
        errorType,
        userId: options?.userId,
      });
      await sleep(delay);
    }
  }

  const finalType = lastError?.errorType ?? "UNKNOWN";
  throw new PuppeteerResilienceError(
    `[${finalType}] All ${maxRetries + 1} attempts exhausted: ${lastError?.message ?? "unknown"}`,
    finalType,
    maxRetries + 1,
    lastError?.originalError,
    { context, userId: options?.userId }
  );
}
