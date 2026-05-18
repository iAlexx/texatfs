/**
 * Local Telegram dev: long-poll getUpdates and POST each update to localhost webhook.
 * Deletes the Bot API webhook first so Telegram delivers updates via polling only.
 *
 * Terminal 1: npm run dev
 * Terminal 2: npm run telegram:poll
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
  }
}

const TELEGRAM_API = "https://api.telegram.org";

async function botApi<T>(
  token: string,
  method: string,
  body?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) {
    throw new Error(`Telegram ${method} failed: ${json.description ?? res.status}`);
  }
  return json.result as T;
}

async function main() {
  const root = resolve(__dirname, "..");
  loadEnv(resolve(root, ".env.local"));
  loadEnv(resolve(root, ".env"));

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN missing in .env.local");

  const webhookTarget =
    process.env.TELEGRAM_DEV_WEBHOOK_URL?.trim() ??
    "http://127.0.0.1:3000/api/telegram/webhook";

  console.info("[telegram:poll] deleting Bot API webhook (required for getUpdates)");
  await botApi(token, "deleteWebhook", { drop_pending_updates: false });

  const info = await botApi<{
    url?: string;
    pending_update_count?: number;
  }>(token, "getWebhookInfo");
  console.info("[telegram:poll] webhook cleared", {
    url: info.url ?? "",
    pending: info.pending_update_count ?? 0,
  });

  console.info("[telegram:poll] forwarding updates to", webhookTarget);
  console.info("[telegram:poll] ensure npm run dev is running on port 3000");

  let offset = 0;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

  for (;;) {
    const updates = await botApi<
      Array<{
        update_id: number;
        message?: { text?: string; chat?: { id: number } };
      }>
    >(token, "getUpdates", {
      offset,
      timeout: 30,
      allowed_updates: ["message"],
    });

    for (const update of updates) {
      offset = update.update_id + 1;
      const preview = update.message?.text?.slice(0, 60) ?? "(no text)";
      console.info("[telegram:poll] update", {
        update_id: update.update_id,
        chat: update.message?.chat?.id,
        preview,
      });

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (secret) headers["x-telegram-bot-api-secret-token"] = secret;

      const res = await fetch(webhookTarget, {
        method: "POST",
        headers,
        body: JSON.stringify(update),
      });

      const body = await res.text();
      if (!res.ok) {
        console.error("[telegram:poll] webhook POST failed", {
          status: res.status,
          body: body.slice(0, 500),
        });
      } else {
        console.info("[telegram:poll] webhook OK", { status: res.status });
      }
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
