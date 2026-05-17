/**
 * Prints Telegram getWebhookInfo (no secrets).
 * Loads .env.local from project root.
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

async function main() {
  const root = resolve(__dirname, "..");
  loadEnv(resolve(root, ".env.local"));

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log(JSON.stringify({ ok: false, error: "TELEGRAM_BOT_TOKEN missing locally" }));
    process.exit(1);
  }

  const res = await fetch(
    `https://api.telegram.org/bot${token}/getWebhookInfo`
  );
  const json = (await res.json()) as {
    ok: boolean;
    result?: {
      url?: string;
      has_custom_certificate?: boolean;
      pending_update_count?: number;
      last_error_date?: number;
      last_error_message?: string;
      max_connections?: number;
      ip_address?: string;
    };
  };

  const r = json.result ?? {};
  console.log(
    JSON.stringify(
      {
        ok: json.ok,
        webhook_url: r.url ?? null,
        pending_updates: r.pending_update_count ?? 0,
        last_error: r.last_error_message ?? null,
        last_error_date: r.last_error_date
          ? new Date(r.last_error_date * 1000).toISOString()
          : null,
        expected_url: "https://texatfs.vercel.app/api/telegram/webhook",
        url_matches:
          r.url === "https://texatfs.vercel.app/api/telegram/webhook",
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
