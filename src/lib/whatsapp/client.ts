/**
 * WhatsApp Outgoing Client
 *
 * Sends text messages to a WASenderAPI-style gateway using a Bearer token.
 * Supports quoting/replying to an existing message — required by our cash
 * confirmation state machine.
 */
import { createLogger } from "@/lib/observability/logger";
import { retryAsync } from "@/lib/utils/async-retry";

const log = createLogger("whatsapp/client");

const DEFAULT_BASE_URL = "https://api.wasenderapi.com";
const SEND_TIMEOUT_MS = 10_000;
const MAX_SEND_ATTEMPTS = 2;

// ── Error type ────────────────────────────────────────────────────────────────

export type WhatsAppErrorCode =
  | "not_configured"
  | "rate_limit"
  | "auth"
  | "network"
  | "upstream";

export class WhatsAppError extends Error {
  constructor(
    message: string,
    readonly code: WhatsAppErrorCode,
    readonly status?: number
  ) {
    super(message);
    this.name = "WhatsAppError";
  }
}

// ── Config ────────────────────────────────────────────────────────────────────

function getToken(): string {
  const t = process.env.WHATSAPP_API_TOKEN;
  if (!t) {
    throw new WhatsAppError(
      "WHATSAPP_API_TOKEN is not configured.",
      "not_configured"
    );
  }
  return t;
}

function getBaseUrl(): string {
  return process.env.WHATSAPP_API_URL?.trim() || DEFAULT_BASE_URL;
}

// ── Send result ───────────────────────────────────────────────────────────────

export interface WhatsAppSendResult {
  messageId: string;
  raw: unknown;
}

interface SendMessageOptions {
  quotedMessageId?: string;
}

async function sendWhatsAppMessageOnce(
  chatId: string,
  text: string,
  options: SendMessageOptions = {}
): Promise<WhatsAppSendResult> {
  const token = getToken();
  const url = `${getBaseUrl()}/api/send-message`;

  const payload: Record<string, unknown> = {
    to: chatId,
    chatId,
    text,
    message: text,
  };
  if (options.quotedMessageId) {
    payload.replyTo = options.quotedMessageId;
    payload.reply_to_message_id = options.quotedMessageId;
    payload.quotedMessageId = options.quotedMessageId;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    throw new WhatsAppError(
      `WhatsApp gateway unreachable: ${err instanceof Error ? err.message : String(err)}`,
      "network"
    );
  } finally {
    clearTimeout(timeout);
  }

  let body: unknown = null;
  try {
    body = await res.clone().json();
  } catch {
    body = await res.text().catch(() => "");
  }

  if (!res.ok) {
    const errMsg = extractErrorMessage(body) ?? `HTTP ${res.status}`;
    log.warn("sendMessage failed", {
      status: res.status,
      chatIdSuffix: chatId.slice(-8),
      preview: typeof body === "string" ? body.slice(0, 120) : undefined,
    });
    if (res.status === 401 || res.status === 403) {
      throw new WhatsAppError(`WhatsApp auth failed: ${errMsg}`, "auth", res.status);
    }
    if (res.status === 429) {
      throw new WhatsAppError(`WhatsApp rate limit: ${errMsg}`, "rate_limit", res.status);
    }
    throw new WhatsAppError(`WhatsApp gateway error: ${errMsg}`, "upstream", res.status);
  }

  const msgId = extractMessageId(body);
  if (!msgId) {
    log.warn("send succeeded but no messageId extracted", {
      chatIdSuffix: chatId.slice(-8),
      responseKeys: body && typeof body === "object" ? Object.keys(body as Record<string, unknown>).join(",") : "non-object",
      dataKeys: body && typeof body === "object" && (body as Record<string, unknown>).data && typeof (body as Record<string, unknown>).data === "object"
        ? Object.keys((body as Record<string, unknown>).data as Record<string, unknown>).join(",")
        : "none",
    });
  }
  return { messageId: msgId, raw: body };
}

/**
 * Send a text message to a WhatsApp chat (private or group).
 * Retries once on transient network/5xx errors only.
 */
export async function sendWhatsAppMessage(
  chatId: string,
  text: string,
  options: SendMessageOptions = {}
): Promise<WhatsAppSendResult> {
  return retryAsync(() => sendWhatsAppMessageOnce(chatId, text, options), {
    maxAttempts: MAX_SEND_ATTEMPTS,
    baseDelayMs: 1500,
    label: "whatsapp-send",
    shouldRetry: (err) => {
      if (err instanceof WhatsAppError) {
        if (err.code === "rate_limit" || err.code === "auth") return false;
        if (err.code === "network") return true;
        if (err.code === "upstream" && err.status && err.status >= 500) return true;
      }
      return false;
    },
  });
}

export function replyToWhatsAppMessage(
  chatId: string,
  quotedMessageId: string,
  text: string
): Promise<WhatsAppSendResult> {
  return sendWhatsAppMessage(chatId, text, { quotedMessageId });
}

function extractMessageId(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const b = body as Record<string, unknown>;

  if (typeof b.messageId === "string") return b.messageId;
  if (typeof b.msgId === "string") return b.msgId;
  if (typeof b.msgId === "number") return String(b.msgId);
  if (typeof b.id === "string") return b.id;

  const data = (b.data ?? b.result) as Record<string, unknown> | undefined;
  if (data && typeof data === "object") {
    if (typeof data.messageId === "string") return data.messageId;
    if (typeof data.msgId === "string") return data.msgId;
    if (typeof data.msgId === "number") return String(data.msgId);
    if (typeof data.id === "string") return data.id;
    const key = data.key as Record<string, unknown> | undefined;
    if (key && typeof key.id === "string") return key.id;
  }
  return "";
}

function extractErrorMessage(body: unknown): string | null {
  if (!body) return null;
  if (typeof body === "string") return body.slice(0, 200);
  if (typeof body !== "object") return String(body);
  const b = body as Record<string, unknown>;
  if (typeof b.message === "string") return b.message;
  if (typeof b.error === "string") return b.error;
  return null;
}
