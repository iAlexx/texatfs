/**
 * Normalised shape of the incoming WhatsApp gateway webhook payload.
 *
 * WASenderAPI (2025+) nests message data under `data.messages` and may
 * use LID addressing (`@lid` suffix) instead of `@s.whatsapp.net`.
 * We normalise here in one place so the rest of the codebase stays clean.
 */

/** Private (DM) message — used for emoji onboarding handshake. */
export interface WhatsAppPrivateMessage {
  eventType:       string;
  /** Chat JID — may be @s.whatsapp.net, @c.us, or @lid. */
  chatId:          string;
  messageId:       string;
  text:            string;
  quotedMessageId: string | null;
  timestamp:       number;
  /** Cleaned sender phone (digits only) extracted from WASenderAPI `cleanedSenderPn`. */
  senderPhone:     string | null;
}

/** Internal canonical message representation passed to the cash handler. */
export interface WhatsAppIncomingMessage {
  /** Event type, e.g. "messages-group.received" or "messages.received". */
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
  /** Cleaned participant phone (digits only) from WASenderAPI. */
  senderPhone:      string | null;
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
  // WASenderAPI nests message under `messages`
  messages?: RawWhatsAppData;

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
  key?:        {
    id?: string;
    remoteJid?: string;
    participant?: string;
    participantPn?: string;
    cleanedSenderPn?: string;
    cleanedParticipantPn?: string;
    senderLid?: string;
    participantLid?: string;
  };

  // Body — WASenderAPI uses `messageBody` as unified text field
  messageBody?: string;
  body?:       string;
  text?:       string;
  message?:    {
    conversation?: string;
    text?: string;
    extendedTextMessage?: {
      text?: string;
      contextInfo?: { stanzaId?: string; quotedMessage?: unknown };
    };
  };

  // WASenderAPI cleaned phone numbers
  cleanedSenderPn?: string;
  cleanedParticipantPn?: string;

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
 * Build a list of candidate data objects from the raw envelope.
 * WASenderAPI nests the actual message under `data.messages`,
 * so we try that path first, then fall back to older layouts.
 */
function buildCandidates(raw: RawWhatsAppWebhook): RawWhatsAppData[] {
  const out: RawWhatsAppData[] = [];

  // WASenderAPI 2025+: data.messages is the actual message object
  if (raw.data?.messages && typeof raw.data.messages === "object") {
    out.push(raw.data.messages as RawWhatsAppData);
  }

  // Older format or other providers: data itself holds the message fields
  if (raw.data) out.push(raw.data);
  if (raw.payload) out.push(raw.payload);
  if (raw.message) out.push(raw.message as RawWhatsAppData);

  // Last resort: top-level envelope
  out.push(raw as unknown as RawWhatsAppData);

  return out;
}

/**
 * Convert a raw provider envelope into our canonical GROUP shape.
 * Returns null when the payload is missing the bits we strictly need.
 */
export function normaliseWhatsAppWebhook(
  raw: RawWhatsAppWebhook
): WhatsAppIncomingMessage | null {
  const eventType = String(raw.event ?? raw.type ?? "");

  for (const data of buildCandidates(raw)) {
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
      senderPhone: parsed.senderPhone,
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
  senderPhone: string | null;
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

  // WASenderAPI `messageBody` is the unified text field (covers plain, caption, reply)
  const text =
    (
      pickString(data.messageBody) ??
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
    pickString(data.message?.extendedTextMessage?.contextInfo?.stanzaId) ??
    null;

  const senderId =
    pickString(data.senderId) ??
    pickString(data.participant) ??
    pickString(data.author) ??
    pickString(data.key?.participant) ??
    null;

  // WASenderAPI provides cleaned phone numbers separately from LIDs
  const senderPhone =
    pickString(data.cleanedParticipantPn) ??
    pickString(data.cleanedSenderPn) ??
    pickString(data.key?.cleanedParticipantPn) ??
    pickString(data.key?.cleanedSenderPn) ??
    null;

  return {
    chatId,
    messageId,
    text,
    quotedMessageId,
    senderId,
    senderPhone,
    timestamp: parseTimestamp(data.timestamp ?? data.t),
  };
}

/**
 * Normalise a private DM webhook payload.
 * Accepts @s.whatsapp.net, @c.us, AND @lid (WASenderAPI LID addressing).
 * Rejects @g.us (groups).
 */
export function normaliseWhatsAppPrivateWebhook(
  raw: RawWhatsAppWebhook
): WhatsAppPrivateMessage | null {
  const eventType = String(raw.event ?? raw.type ?? "");

  for (const data of buildCandidates(raw)) {
    const parsed = extractChatAndMessage(data);
    if (!parsed.chatId || !parsed.messageId) continue;
    if (parsed.chatId.endsWith("@g.us")) continue;

    const isPrivate =
      parsed.chatId.endsWith("@s.whatsapp.net") ||
      parsed.chatId.endsWith("@c.us") ||
      parsed.chatId.endsWith("@lid");
    if (!isPrivate) continue;

    return {
      eventType,
      chatId: parsed.chatId,
      messageId: parsed.messageId,
      text: parsed.text,
      quotedMessageId: parsed.quotedMessageId,
      timestamp: parsed.timestamp,
      senderPhone: parsed.senderPhone,
    };
  }

  return null;
}
