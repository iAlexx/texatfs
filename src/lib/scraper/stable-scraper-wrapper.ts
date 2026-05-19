/**
 * Stable scraper wrapper — retry, circuit breaker, structured logging.
 *
 * SAFETY: Does NOT import or modify texas-puppeteer-login.ts or login selectors.
 * Wraps post-login sync orchestration only (TexasSyncService, DailyReportOrchestrator).
 *
 * Login browser lifecycle remains inside texas-puppeteer-login.ts (unchanged).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyReportOrchestrator } from "@/lib/services/DailyReportOrchestrator";
import type { TexasSyncService } from "@/lib/services/TexasSyncService";
import type {
  TexasSyncOptions,
  TexasSyncResult,
} from "@/lib/services/TexasSyncService";
import type { TexasSyncUserContext } from "@/lib/texas/types";
import { getAdminTelegramIds, sendTelegramMessage } from "@/lib/telegram/bot-api";

// ── Env-configurable timeouts (defaults per spec) ─────────────────────────────

export const SCRAPER_PAGE_TIMEOUT_MS = parseEnvMs(
  process.env.SCRAPER_PAGE_TIMEOUT_MS,
  45_000
);

export const SCRAPER_NAV_TIMEOUT_MS = parseEnvMs(
  process.env.SCRAPER_NAV_TIMEOUT_MS,
  40_000
);

export const SCRAPER_JOB_TIMEOUT_MS = parseEnvMs(
  process.env.SCRAPER_JOB_TIMEOUT_MS,
  180_000
);

const MAX_ATTEMPTS = Number(process.env.SCRAPER_MAX_ATTEMPTS ?? 4);
const BACKOFF_BASE_MS = Number(process.env.SCRAPER_BACKOFF_BASE_MS ?? 1000);
const CIRCUIT_FAILURE_THRESHOLD = Number(
  process.env.SCRAPER_CIRCUIT_FAILURE_THRESHOLD ?? 4
);
const CIRCUIT_OPEN_MS = Number(
  process.env.SCRAPER_CIRCUIT_OPEN_MS ?? 8 * 60 * 1000
);

/** Documented Chromium flags for operators — login launch uses texas-puppeteer-login.ts */
export const STABLE_CHROMIUM_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
] as const;

// ── Structured logging ───────────────────────────────────────────────────────

export type ScraperLogLevel = "info" | "warn" | "error";

export interface ScraperLogEvent {
  ts: string;
  level: ScraperLogLevel;
  step: string;
  message: string;
  attempt?: number;
  maxAttempts?: number;
  userId?: string;
  durationMs?: number;
  error?: string;
  circuitOpen?: boolean;
  meta?: Record<string, unknown>;
}

function scraperLog(event: Omit<ScraperLogEvent, "ts">): void {
  const line: ScraperLogEvent = { ts: new Date().toISOString(), ...event };
  const payload = JSON.stringify(line);
  if (event.level === "error") {
    console.error(payload);
  } else if (event.level === "warn") {
    console.warn(payload);
  } else {
    console.info(payload);
  }
}

function parseEnvMs(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

// ── Circuit breaker (in-process; one per Railway instance) ────────────────────

interface CircuitState {
  consecutiveFailures: number;
  openUntil: number | null;
  lastError: string | null;
  lastOpenedAt: string | null;
}

const circuit: CircuitState = {
  consecutiveFailures: 0,
  openUntil: null,
  lastError: null,
  lastOpenedAt: null,
};

function isCircuitOpen(): boolean {
  if (!circuit.openUntil) return false;
  if (Date.now() >= circuit.openUntil) {
    circuit.openUntil = null;
    circuit.consecutiveFailures = 0;
    scraperLog({
      level: "info",
      step: "circuit.closed",
      message: "Circuit breaker reset after cooldown",
    });
    return false;
  }
  return true;
}

function recordSuccess(): void {
  circuit.consecutiveFailures = 0;
  circuit.openUntil = null;
  circuit.lastError = null;
}

function recordFailure(error: string): boolean {
  circuit.consecutiveFailures += 1;
  circuit.lastError = error;

  if (circuit.consecutiveFailures < CIRCUIT_FAILURE_THRESHOLD) {
    return false;
  }

  circuit.openUntil = Date.now() + CIRCUIT_OPEN_MS;
  circuit.lastOpenedAt = new Date().toISOString();
  return true;
}

async function alertAdminsCircuitOpen(details: {
  error: string;
  failures: number;
  openMinutes: number;
}): Promise<void> {
  const admins = getAdminTelegramIds();
  if (!admins.length) {
    scraperLog({
      level: "warn",
      step: "circuit.alert",
      message: "No admin Telegram IDs configured",
    });
    return;
  }

  const text = [
    "🛑 <b>Circuit Breaker — Scraping Paused</b>",
    "",
    `Consecutive failures: <b>${details.failures}</b>`,
    `Pause duration: <b>${details.openMinutes} minutes</b>`,
    "",
    `<b>Last error:</b>`,
    `<code>${escapeHtml(details.error.slice(0, 500))}</code>`,
    "",
    "Post-login sync is paused. Login code was not modified.",
    `Timeouts: page=${SCRAPER_PAGE_TIMEOUT_MS}ms nav=${SCRAPER_NAV_TIMEOUT_MS}ms job=${SCRAPER_JOB_TIMEOUT_MS}ms`,
  ].join("\n");

  for (const chatId of admins) {
    await sendTelegramMessage(chatId, text, { parse_mode: "HTML" }).catch(
      () => undefined
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── Generic retry runner ───────────────────────────────────────────────────────

export class ScraperCircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScraperCircuitOpenError";
  }
}

export async function runWithStableScraper<T>(
  step: string,
  fn: () => Promise<T>,
  options?: {
    userId?: string;
    timeoutMs?: number;
    maxAttempts?: number;
    skipCircuitCheck?: boolean;
  }
): Promise<T> {
  if (!options?.skipCircuitCheck && isCircuitOpen()) {
    const until = circuit.openUntil
      ? new Date(circuit.openUntil).toISOString()
      : "unknown";
    throw new ScraperCircuitOpenError(
      `Scraper circuit open until ${until}. Last error: ${circuit.lastError ?? "n/a"}`
    );
  }

  const maxAttempts = options?.maxAttempts ?? MAX_ATTEMPTS;
  const timeoutMs = options?.timeoutMs ?? SCRAPER_JOB_TIMEOUT_MS;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const started = Date.now();
    scraperLog({
      level: "info",
      step: `${step}.start`,
      message: `Attempt ${attempt}/${maxAttempts}`,
      attempt,
      maxAttempts,
      userId: options?.userId,
    });

    try {
      const result = await withTimeout(fn(), timeoutMs, step);
      recordSuccess();
      scraperLog({
        level: "info",
        step: `${step}.success`,
        message: "Completed",
        attempt,
        maxAttempts,
        userId: options?.userId,
        durationMs: Date.now() - started,
      });
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      scraperLog({
        level: "error",
        step: `${step}.failure`,
        message: lastError.message,
        attempt,
        maxAttempts,
        userId: options?.userId,
        durationMs: Date.now() - started,
        error: lastError.message,
      });

      const opened = recordFailure(lastError.message);
      if (opened) {
        scraperLog({
          level: "error",
          step: "circuit.open",
          message: "Circuit breaker opened",
          circuitOpen: true,
          error: lastError.message,
        });
        await alertAdminsCircuitOpen({
          error: lastError.message,
          failures: circuit.consecutiveFailures,
          openMinutes: Math.round(CIRCUIT_OPEN_MS / 60_000),
        });
        throw new ScraperCircuitOpenError(
          `Scraper circuit opened after ${circuit.consecutiveFailures} failures`
        );
      }

      if (attempt < maxAttempts) {
        const delay = backoffMs(attempt);
        scraperLog({
          level: "warn",
          step: `${step}.retry`,
          message: `Retrying in ${delay}ms`,
          attempt,
          maxAttempts,
          userId: options?.userId,
          meta: { delayMs: delay },
        });
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error(`${step} failed after ${maxAttempts} attempts`);
}

// ── Post-login sync wrappers (safe — no login imports) ──────────────────────

export async function runStableTexasSync(
  texasSync: TexasSyncService,
  context: TexasSyncUserContext,
  options?: TexasSyncOptions
): Promise<TexasSyncResult> {
  return runWithStableScraper(
    "texas.syncUser",
    () => texasSync.syncUser(context, options),
    { userId: context.userId }
  );
}

export async function runStableRegisteredUserSync(
  orchestrator: DailyReportOrchestrator,
  userId: string,
  ledgerDate: string,
  texasAffiliateId: string | null,
  role: TexasSyncUserContext["role"] = "master"
): Promise<
  Awaited<ReturnType<DailyReportOrchestrator["runForRegisteredUser"]>>
> {
  return runWithStableScraper(
    "orchestrator.runForRegisteredUser",
    () =>
      orchestrator.runForRegisteredUser(
        userId,
        ledgerDate,
        texasAffiliateId,
        role
      ),
    { userId }
  );
}

/** Expose circuit state for health/debug endpoints */
export function getScraperCircuitStatus(): Readonly<CircuitState> {
  return {
    consecutiveFailures: circuit.consecutiveFailures,
    openUntil: circuit.openUntil,
    lastError: circuit.lastError,
    lastOpenedAt: circuit.lastOpenedAt,
  };
}

/** Manual reset (admin tooling) */
export function resetScraperCircuit(): void {
  circuit.consecutiveFailures = 0;
  circuit.openUntil = null;
  circuit.lastError = null;
  circuit.lastOpenedAt = null;
  scraperLog({
    level: "info",
    step: "circuit.manual_reset",
    message: "Circuit manually reset",
  });
}
