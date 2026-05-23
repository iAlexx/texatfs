/**
 * Normalised shape of the incoming WhatsApp gateway webhook payload.
 *
 * Most WASenderAPI-style providers send slightly different envelopes; we
 * normalise here in one place so the rest of the codebase stays clean.
 */

/** Internal canonical message representation passed to the cash handler. */
export interface WhatsAppIncomingMessage {
  /** Event type, e.g. "messages-group.received" or "message.received". */
  eventType:        string;
  /** WhatsApp group id, e.g. "120363023948721938@g.us". */
  groupId:          string;
  /** Sender JID (the actual human inside the group). */
  senderId:         string | null;
  /** Provider-assigned message id (for reply tracking). */
  messageId:        string;
  /** Message text body — may be empty for non-text events. */
  text:             string;
  /** ID of the message being quoted, if this is a reply. */
  quotedMessageId:  string | null;
  /** Unix epoch (ms). Falls back to Date.now() if absent. */
  timestamp:        number;
}

// ── Raw envelope shapes (intentionally loose) ────────────────────────────────

/** Loose typing — we accept many provider envelopes and normalise downstream. */
export interface RawWhatsAppWebhook {
  event?:  string;
  type?:   string;
  data?:   RawWhatsAppData;
  payload?: RawWhatsAppData;
  message?: RawWhatsAppData;
  [key: string]: unknown;
}

interface RawWhatsAppData {
  // Group / chat identifiers (various provider conventions)
  chatId?:     string;
  groupId?:    string;
  remoteJid?:  string;
  from?:       string;
  to?:         string;

  // Sender (group member)
  senderId?:   string;
  participant?: string;
  author?:     string;

  // Message id
  messageId?:  string;
  id?:         string;
  key?:        { id?: string; remoteJid?: string; participant?: string };

  // Body
  body?:       string;
  text?:       string;
  message?:    { conversation?: string; text?: string; extendedTextMessage?: { text?: string } };

  // Quoted / reply context
  quotedMessageId?:  string;
  reply_to_message_id?: string;
  contextInfo?:      { stanzaId?: string; quotedMessage?: unknown };

  // Timestamp
  timestamp?:  number | string;
  t?:          number;

  [key: string]: unknown;
}

// ── Normalisation ─────────────────────────────────────────────────────────────

/**
 * Convert a raw provider envelope into our canonical shape.
 * Returns null when the payload is missing the bits we strictly need.
 */
export function normaliseWhatsAppWebhook(
  raw: RawWhatsAppWebhook
): WhatsAppIncomingMessage | null {
  const eventType = String(raw.event ?? raw.type ?? "");
  const data: RawWhatsAppData = raw.data ?? raw.payload ?? raw.message ?? raw;

  const groupId =
    pickString(data.chatId) ??
    pickString(data.groupId) ??
    pickString(data.remoteJid) ??
    pickString(data.from) ??
    pickString(data.key?.remoteJid);

  if (!groupId) return null;
  // Only process group chats (must end with @g.us). Private DMs are ignored.
  if (!groupId.endsWith("@g.us")) return null;

  const messageId =
    pickString(data.messageId) ??
    pickString(data.id) ??
    pickString(data.key?.id);

  if (!messageId) return null;

  const text =
    pickString(data.body) ??
    pickString(data.text) ??
    pickString(data.message?.conversation) ??
    pickString(data.message?.text) ??
    pickString(data.message?.extendedTextMessage?.text) ??
    "";

  const quotedMessageId =
    pickString(data.quotedMessageId) ??
    pickString(data.reply_to_message_id) ??
    pickString(data.contextInfo?.stanzaId) ??
    null;

  const senderId =
    pickString(data.senderId) ??
    pickString(data.participant) ??
    pickString(data.author) ??
    pickString(data.key?.participant) ??
    null;

  const tsRaw = data.timestamp ?? data.t;
  const timestamp =
    typeof tsRaw === "number"
      ? (tsRaw < 1e12 ? tsRaw * 1000 : tsRaw)
      : typeof tsRaw === "string"
      ? Number(tsRaw) || Date.now()
      : Date.now();

  return {
    eventType,
    groupId,
    senderId,
    messageId,
    text:            text.trim(),
    quotedMessageId,
    timestamp,
  };
}

function pickString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
