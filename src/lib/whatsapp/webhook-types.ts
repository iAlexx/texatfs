/**
 * Normalised shape of the incoming WhatsApp gateway webhook payload.
 *
 * Most WASenderAPI-style providers send slightly different envelopes; we
 * normalise here in one place so the rest of the codebase stays clean.
 */

/** Private (DM) message — used for emoji onboarding handshake. */
export interface WhatsAppPrivateMessage {
  eventType:       string;
  /** User JID, e.g. 963988899474@s.whatsapp.net */
  chatId:          string;
  messageId:       string;
  text:            string;
  quotedMessageId: string | null;
  timestamp:       number;
}

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

  // Try nested data first, then fall back to the raw envelope itself.
  // WASenderAPI sometimes sends the fields at the top level.
  const candidates: RawWhatsAppData[] = [
    raw.data,
    raw.payload,
    raw.message,
    raw as RawWhatsAppData,
  ].filter(Boolean) as RawWhatsAppData[];

  for (const data of candidates) {
    const parsed = extractChatAndMessage(data);
    if (!parsed.chatId || !parsed.messageId) continue;
    if (!parsed.chatId.endsWith("@g.us")) continue;

    return {
      eventType,
      groupId: parsed.chatId,
      senderId: parsed.senderId,
      messageId: parsed.messageId,
      text: parsed.text,
      quotedMessageId: parsed.quotedMessageId,
      timestamp: parsed.timestamp,
    };
  }

  return null;
}

function pickString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function parseTimestamp(tsRaw: unknown): number {
  if (typeof tsRaw === "number") {
    return tsRaw < 1e12 ? tsRaw * 1000 : tsRaw;
  }
  if (typeof tsRaw === "string") {
    return Number(tsRaw) || Date.now();
  }
  return Date.now();
}

function extractChatAndMessage(data: RawWhatsAppData): {
  chatId: string | undefined;
  messageId: string | undefined;
  text: string;
  quotedMessageId: string | null;
  senderId: string | null;
  timestamp: number;
} {
  const chatId =
    pickString(data.chatId) ??
    pickString(data.groupId) ??
    pickString(data.remoteJid) ??
    pickString(data.from) ??
    pickString(data.key?.remoteJid);

  const messageId =
    pickString(data.messageId) ??
    pickString(data.id) ??
    pickString(data.key?.id);

  const text =
    (
      pickString(data.body) ??
      pickString(data.text) ??
      pickString(data.message?.conversation) ??
      pickString(data.message?.text) ??
      pickString(data.message?.extendedTextMessage?.text) ??
      ""
    ).trim();

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

  return {
    chatId,
    messageId,
    text,
    quotedMessageId,
    senderId,
    timestamp: parseTimestamp(data.timestamp ?? data.t),
  };
}

/**
 * Normalise a private DM webhook payload.
 * Routing is by JID only (@s.whatsapp.net / @c.us) — never group @g.us.
 */
export function normaliseWhatsAppPrivateWebhook(
  raw: RawWhatsAppWebhook
): WhatsAppPrivateMessage | null {
  const eventType = String(raw.event ?? raw.type ?? "");

  const candidates: RawWhatsAppData[] = [
    raw.data,
    raw.payload,
    raw.message,
    raw as RawWhatsAppData,
  ].filter(Boolean) as RawWhatsAppData[];

  for (const data of candidates) {
    const parsed = extractChatAndMessage(data);
    if (!parsed.chatId || !parsed.messageId) continue;
    if (parsed.chatId.endsWith("@g.us")) continue;

    const isPrivate =
      parsed.chatId.endsWith("@s.whatsapp.net") ||
      parsed.chatId.endsWith("@c.us");
    if (!isPrivate) continue;

    return {
      eventType,
      chatId: parsed.chatId,
      messageId: parsed.messageId,
      text: parsed.text,
      quotedMessageId: parsed.quotedMessageId,
      timestamp: parsed.timestamp,
    };
  }

  return null;
}
