/**
 * WhatsApp Outgoing Client
 *
 * Sends text messages to a WASenderAPI-style gateway using a Bearer token.
 * Supports quoting/replying to an existing message — required by our cash
 * confirmation state machine.
 *
 * Required env vars:
 *   WHATSAPP_API_TOKEN   — Bearer token for the gateway provider.
 *   WHATSAPP_API_URL     — (optional) override base URL. Defaults to
 *                          https://api.wasenderapi.com
 */

const DEFAULT_BASE_URL = "https://api.wasenderapi.com";
const SEND_TIMEOUT_MS  = 10_000;

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
  /** Provider-assigned message ID (used for reply tracking). */
  messageId: string;
  /** Raw provider response for debugging. */
  raw: unknown;
}

interface SendMessageOptions {
  /** Quote/reply to a previous message in the same chat. */
  quotedMessageId?: string;
}

/**
 * Send a text message to a WhatsApp chat (private or group).
 *
 * @param chatId  Group id like "120363023948721938@g.us" or user JID.
 * @param text    Message body. WhatsApp formatting (*bold*, _italic_) supported.
 */
export async function sendWhatsAppMessage(
  chatId: string,
  text: string,
  options: SendMessageOptions = {}
): Promise<WhatsAppSendResult> {
  const token = getToken();
  const url   = `${getBaseUrl()}/api/send-message`;

  // Build provider-compatible payload. We include both common aliases so the
  // request works with WASenderAPI as well as similar Bearer-token gateways.
  const payload: Record<string, unknown> = {
    to: chatId,
    chatId,
    text,
    message: text,
  };
  if (options.quotedMessageId) {
    payload.reply_to_message_id = options.quotedMessageId;
    payload.quotedMessageId     = options.quotedMessageId;
  }

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        Authorization:   `Bearer ${token}`,
        Accept:          "application/json",
      },
      body:   JSON.stringify(payload),
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
    console.error("[whatsapp] sendMessage failed", {
      status: res.status,
      chatId,
      preview: typeof body === "string" ? body.slice(0, 200) : body,
    });
    if (res.status === 401 || res.status === 403) {
      throw new WhatsAppError(`WhatsApp auth failed: ${errMsg}`, "auth", res.status);
    }
    if (res.status === 429) {
      throw new WhatsAppError(`WhatsApp rate limit: ${errMsg}`, "rate_limit", res.status);
    }
    throw new WhatsAppError(`WhatsApp gateway error: ${errMsg}`, "upstream", res.status);
  }

  const messageId = extractMessageId(body);
  return { messageId, raw: body };
}

/**
 * Reply to a previous message by quoting it.
 * Convenience wrapper around sendWhatsAppMessage.
 */
export function replyToWhatsAppMessage(
  chatId: string,
  quotedMessageId: string,
  text: string
): Promise<WhatsAppSendResult> {
  return sendWhatsAppMessage(chatId, text, { quotedMessageId });
}

// ── Response parsing ──────────────────────────────────────────────────────────

function extractMessageId(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const b = body as Record<string, unknown>;

  // Common locations across providers:
  //   { messageId: "..." }
  //   { data: { messageId: "..." } }
  //   { data: { key: { id: "..." } } }
  //   { result: { id: "..." } }
  if (typeof b.messageId === "string") return b.messageId;
  if (typeof b.id        === "string") return b.id;

  const data = (b.data ?? b.result) as Record<string, unknown> | undefined;
  if (data && typeof data === "object") {
    if (typeof data.messageId === "string") return data.messageId;
    if (typeof data.id        === "string") return data.id;
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
  if (typeof b.error   === "string") return b.error;
  return null;
}
