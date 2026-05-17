const TELEGRAM_API = "https://api.telegram.org";

export interface TelegramMessage {
  message_id: number;
  chat: { id: number };
  from?: { id: number; first_name?: string; last_name?: string; username?: string };
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return token;
}

export async function sendTelegramMessage(
  chatId: number,
  text: string,
  options?: { parse_mode?: "HTML" | "Markdown" }
): Promise<void> {
  const res = await fetch(
    `${TELEGRAM_API}/bot${botToken()}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options?.parse_mode,
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendMessage failed: ${res.status} ${body}`);
  }
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
