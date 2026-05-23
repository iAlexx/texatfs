export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  /** Short subsystem label, e.g. `whatsapp/webhook`. */
  scope: string;
  /** Optional correlation id (request, webhook, user). */
  requestId?: string;
  [key: string]: unknown;
}

const SECRET_KEY_RE =
  /(token|secret|password|cookie|authorization|api[_-]?key|initdata|bearer)/i;

function redactValue(key: string, value: unknown): unknown {
  if (SECRET_KEY_RE.test(key)) return "[REDACTED]";
  if (typeof value === "string" && value.length > 80 && SECRET_KEY_RE.test(key)) {
    return "[REDACTED]";
  }
  if (Array.isArray(value)) {
    return value.map((v, i) => redactValue(String(i), v));
  }
  if (value && typeof value === "object") {
    return redactObject(value as Record<string, unknown>);
  }
  return value;
}

function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = redactValue(k, v);
  }
  return out;
}

import { getRequestId } from "./request-context";

function emit(level: LogLevel, message: string, ctx?: LogContext): void {
  const requestId = ctx?.requestId ?? getRequestId();
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(requestId ? { requestId } : {}),
    ...(ctx ? redactObject(ctx) : {}),
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level === "debug" && process.env.LOG_DEBUG === "true") console.debug(line);
  else console.info(line);
}

/** Lightweight Railway-friendly structured logger. */
export function createLogger(scope: string, base?: Partial<LogContext>) {
  const baseCtx = { scope, ...base };
  return {
    debug: (message: string, extra?: Record<string, unknown>) =>
      emit("debug", message, { ...baseCtx, ...extra }),
    info: (message: string, extra?: Record<string, unknown>) =>
      emit("info", message, { ...baseCtx, ...extra }),
    warn: (message: string, extra?: Record<string, unknown>) =>
      emit("warn", message, { ...baseCtx, ...extra }),
    error: (message: string, extra?: Record<string, unknown>) =>
      emit("error", message, { ...baseCtx, ...extra }),
  };
}

export const log = createLogger("app");
