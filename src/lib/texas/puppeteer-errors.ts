/**
 * Puppeteer error classification for Texas browser automation.
 *
 * Every Puppeteer failure gets classified into one of these categories,
 * which drives retry logic and alerting:
 *
 *   CLOUDFLARE_BLOCK  — Cloudflare blocked/challenged us → no retry, alert
 *   LOGIN_FAILED      — Texas rejected credentials → no retry (bad creds)
 *   TIMEOUT           — Navigation/response exceeded deadline → retry
 *   NETWORK_ERROR     — DNS, TCP, proxy failure → retry
 *   SESSION_CRASHED   — Chromium OOM/SIGKILL/Target closed → retry
 *   DETECTION_RISK    — Bot detection fingerprint trigger → no retry, alert
 *   UNKNOWN           — Unclassified → retry with caution
 */

export const PUPPETEER_ERROR_TYPES = [
  "CLOUDFLARE_BLOCK",
  "LOGIN_FAILED",
  "TIMEOUT",
  "NETWORK_ERROR",
  "SESSION_CRASHED",
  "DETECTION_RISK",
  "UNKNOWN",
] as const;

export type PuppeteerErrorType = (typeof PUPPETEER_ERROR_TYPES)[number];

export class PuppeteerClassifiedError extends Error {
  constructor(
    message: string,
    readonly errorType: PuppeteerErrorType,
    readonly originalError?: Error,
    readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "PuppeteerClassifiedError";
  }

  get retryable(): boolean {
    return isRetryable(this.errorType);
  }
}

/** Errors that should never be retried — require human intervention or cooldown. */
const NON_RETRYABLE: ReadonlySet<PuppeteerErrorType> = new Set([
  "CLOUDFLARE_BLOCK",
  "LOGIN_FAILED",
  "DETECTION_RISK",
]);

/** Errors that warrant an immediate Telegram alert to admins. */
const ALERT_WORTHY: ReadonlySet<PuppeteerErrorType> = new Set([
  "CLOUDFLARE_BLOCK",
  "DETECTION_RISK",
]);

export function isRetryable(type: PuppeteerErrorType): boolean {
  return !NON_RETRYABLE.has(type);
}

export function isAlertWorthy(type: PuppeteerErrorType): boolean {
  return ALERT_WORTHY.has(type);
}

// ── Pattern matchers (order matters — first match wins) ──────────────────────

interface ErrorPattern {
  type: PuppeteerErrorType;
  test: (msg: string) => boolean;
}

const PATTERNS: readonly ErrorPattern[] = [
  // Cloudflare
  {
    type: "CLOUDFLARE_BLOCK",
    test: (m) =>
      /cloudflare did not clear/i.test(m) ||
      /just a moment/i.test(m) ||
      /attention required/i.test(m) ||
      /cf[-_]?challenge/i.test(m) ||
      /verify you are human/i.test(m) ||
      /ray id/i.test(m) ||
      /blocked by cloudflare/i.test(m),
  },
  // Bot detection
  {
    type: "DETECTION_RISK",
    test: (m) =>
      /bot[\s-]?detect/i.test(m) ||
      /automation[\s-]?detected/i.test(m) ||
      /captcha/i.test(m) ||
      /recaptcha/i.test(m) ||
      /enable javascript/i.test(m) ||
      /access[\s-]?denied.*automat/i.test(m),
  },
  // Login failures (Texas-side rejection)
  {
    type: "LOGIN_FAILED",
    test: (m) =>
      /signIn rejected/i.test(m) ||
      /login.*failed/i.test(m) ||
      /login.*form not found/i.test(m) ||
      /login.*inputs disappeared/i.test(m) ||
      /invalid.*credentials/i.test(m) ||
      /wrong.*password/i.test(m) ||
      /sign-in failed/i.test(m) ||
      /account.*locked/i.test(m) ||
      /account.*suspended/i.test(m),
  },
  // Chromium crash / OOM
  {
    type: "SESSION_CRASHED",
    test: (m) =>
      /target closed/i.test(m) ||
      /session closed/i.test(m) ||
      /browser closed/i.test(m) ||
      /protocol error/i.test(m) ||
      /browser.*disconnected/i.test(m) ||
      /chromium.*crash/i.test(m) ||
      /oom/i.test(m) ||
      /sigkill/i.test(m),
  },
  // Timeouts
  {
    type: "TIMEOUT",
    test: (m) =>
      /timed?\s*out/i.test(m) ||
      /timeout/i.test(m) ||
      /exceeded.*deadline/i.test(m) ||
      /navigation timeout/i.test(m) ||
      /waitfor.*timeout/i.test(m),
  },
  // Network errors
  {
    type: "NETWORK_ERROR",
    test: (m) =>
      /net::err/i.test(m) ||
      /econnrefused/i.test(m) ||
      /econnreset/i.test(m) ||
      /enotfound/i.test(m) ||
      /epipe/i.test(m) ||
      /ehostunreach/i.test(m) ||
      /fetch failed/i.test(m) ||
      /dns.*resol/i.test(m) ||
      /proxy.*error/i.test(m) ||
      /socket hang up/i.test(m) ||
      /network.*error/i.test(m),
  },
];

/**
 * Classify any error from the Puppeteer/browser layer into a deterministic type.
 * First matching pattern wins. Falls through to UNKNOWN.
 */
export function classifyPuppeteerError(error: unknown): PuppeteerErrorType {
  const msg = error instanceof Error ? error.message : String(error);
  for (const pattern of PATTERNS) {
    if (pattern.test(msg)) return pattern.type;
  }
  return "UNKNOWN";
}

/**
 * Wrap an error with full classification metadata.
 */
export function classifyAndWrap(
  error: unknown,
  context?: Record<string, unknown>
): PuppeteerClassifiedError {
  const type = classifyPuppeteerError(error);
  const original = error instanceof Error ? error : new Error(String(error));
  return new PuppeteerClassifiedError(original.message, type, original, context);
}
