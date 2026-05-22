const TELEGRAM_API = "https://api.telegram.org";

export interface TelegramMessage {
  message_id: number;
  chat: {
    id: number;
    type: "private" | "group" | "supergroup" | "channel";
  };
  from?: { id: number; first_name?: string; last_name?: string; username?: string };
  text?: string;
  /** Present in messages sent inside a Forum Topic thread. */
  message_thread_id?: number;
}

export interface TelegramInlineKeyboard {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
}

export interface TelegramCallbackQuery {
  id: string;
  from: { id: number; first_name?: string };
  message?: {
    message_id: number;
    chat: { id: number };
    /** Present when the keyboard message lives inside a Forum Topic. */
    message_thread_id?: number;
  };
  data?: string;
}

/** Fired when the bot's own membership status changes in a chat. */
export interface TelegramMyChatMember {
  chat: {
    id: number;
    title?: string;
    type: "private" | "group" | "supergroup" | "channel";
    /** True when the supergroup is a Forum (Topics enabled). */
    is_forum?: boolean;
  };
  from: { id: number; first_name?: string; username?: string };
  date: number;
  old_chat_member: { user: { id: number }; status: string };
  new_chat_member: { user: { id: number }; status: string };
}

export interface TelegramForumTopic {
  message_thread_id: number;
  name: string;
  icon_color: number;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  my_chat_member?: TelegramMyChatMember;
}

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return token;
}

export async function sendTelegramPhoto(
  chatId: number,
  photo: Buffer,
  options?: { caption?: string; filename?: string }
): Promise<void> {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (options?.caption) {
    form.append("caption", options.caption);
  }
  form.append(
    "photo",
    new Blob([new Uint8Array(photo)], { type: "image/png" }),
    options?.filename ?? "daily-report.png"
  );

  const res = await fetch(`${TELEGRAM_API}/bot${botToken()}/sendPhoto`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[telegram] sendPhoto failed", {
      status: res.status,
      bodyPreview: body.slice(0, 200),
    });
    throw new Error(`Telegram sendPhoto failed: ${res.status} ${body}`);
  }
}

export async function sendTelegramMessage(
  chatId: number,
  text: string,
  options?: {
    parse_mode?: "HTML" | "Markdown";
    reply_markup?: TelegramInlineKeyboard;
  }
): Promise<{ message_id: number }> {
  const res = await fetch(
    `${TELEGRAM_API}/bot${botToken()}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options?.parse_mode,
        reply_markup: options?.reply_markup,
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    console.error("[fetch-trace] Telegram sendMessage failed", {
      url: `${TELEGRAM_API}/bot***/sendMessage`,
      status: res.status,
      bodyPreview: body.slice(0, 200),
    });
    throw new Error(`Telegram sendMessage failed: ${res.status} ${body}`);
  }

  const json = (await res.json()) as { result?: { message_id: number } };
  return { message_id: json.result?.message_id ?? 0 };
}

export async function editTelegramMessage(
  chatId: number,
  messageId: number,
  text: string,
  options?: {
    parse_mode?: "HTML" | "Markdown";
    reply_markup?: TelegramInlineKeyboard;
  }
): Promise<void> {
  const res = await fetch(`${TELEGRAM_API}/bot${botToken()}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: options?.parse_mode,
      reply_markup: options?.reply_markup,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram editMessageText failed: ${res.status} ${body}`);
  }
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<void> {
  await fetch(`${TELEGRAM_API}/bot${botToken()}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
      show_alert: text ? text.length > 60 : false,
    }),
  });
}

export function parseAdminIds(): Set<number> {
  const raw = process.env.TELEGRAM_ADMIN_IDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number(s))
      .filter((n) => !Number.isNaN(n))
  );
}

export function isAdmin(telegramUserId: number): boolean {
  return parseAdminIds().has(telegramUserId);
}

export function getAdminTelegramIds(): number[] {
  return [...parseAdminIds()];
}

// ─── Forum Topics (supergroup with is_forum = true) ───────────────────────────

/**
 * Create a Forum Topic in a supergroup.
 * Requires the bot to be an admin with can_manage_topics permission.
 */
export async function createForumTopic(
  chatId: number,
  name: string
): Promise<TelegramForumTopic> {
  const res = await fetch(`${TELEGRAM_API}/bot${botToken()}/createForumTopic`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, name }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram createForumTopic failed: ${res.status} ${body}`);
  }

  const json = (await res.json()) as { result?: TelegramForumTopic };
  if (!json.result) throw new Error("Telegram createForumTopic: empty result");
  return json.result;
}

/**
 * Send a text message to a specific Forum Topic (message_thread_id).
 * Supports inline keyboard markup for confirmation flows.
 */
export async function sendMessageToTopic(
  chatId: number,
  threadId: number,
  text: string,
  options?: {
    parse_mode?: "HTML" | "Markdown";
    reply_markup?: TelegramInlineKeyboard;
  }
): Promise<{ message_id: number }> {
  const res = await fetch(`${TELEGRAM_API}/bot${botToken()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_thread_id: threadId,
      text,
      parse_mode: options?.parse_mode,
      reply_markup: options?.reply_markup,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendMessageToTopic failed: ${res.status} ${body}`);
  }

  const json = (await res.json()) as { result?: { message_id: number } };
  return { message_id: json.result?.message_id ?? 0 };
}

/** Delete a message. Fails silently if already deleted or bot lacks permission. */
export async function deleteMessage(
  chatId: number,
  messageId: number
): Promise<void> {
  await fetch(`${TELEGRAM_API}/bot${botToken()}/deleteMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  }).catch(() => undefined);
}

/**
 * Send a PNG photo to a specific Forum Topic (message_thread_id).
 */
export async function sendPhotoToTopic(
  chatId: number,
  threadId: number,
  photo: Buffer,
  caption?: string
): Promise<void> {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("message_thread_id", String(threadId));
  if (caption) form.append("caption", caption);
  form.append(
    "photo",
    new Blob([new Uint8Array(photo)], { type: "image/png" }),
    "daily-report.png"
  );

  const res = await fetch(`${TELEGRAM_API}/bot${botToken()}/sendPhoto`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendPhotoToTopic failed: ${res.status} ${body}`);
  }
}
