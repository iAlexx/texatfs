const TELEGRAM_API = "https://api.telegram.org";

export interface TelegramMessage {
  message_id: number;
  chat: { id: number };
  from?: { id: number; first_name?: string; last_name?: string; username?: string };
  text?: string;
}

export interface TelegramInlineKeyboard {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
}

export interface TelegramCallbackQuery {
  id: string;
  from: { id: number; first_name?: string };
  message?: { message_id: number; chat: { id: number } };
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
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
