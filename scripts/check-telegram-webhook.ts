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

  const expectedProduction =
    process.env.TELEGRAM_PRODUCTION_WEBHOOK_URL?.trim() ??
    (process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/telegram/webhook`
      : null);

  const res = await fetch(
    `https://api.telegram.org/bot${token}/getWebhookInfo`
  );
  const json = (await res.json()) as {
    ok: boolean;
    result?: {
      url?: string;
      pending_update_count?: number;
      last_error_date?: number;
      last_error_message?: string;
    };
  };

  const r = json.result ?? {};
  let localWebhookReachable: boolean | null = null;
  const localUrl =
    process.env.TELEGRAM_DEV_WEBHOOK_URL?.trim() ??
    "http://127.0.0.1:3000/api/telegram/webhook";

  try {
    const probe = await fetch(localUrl, { method: "GET" });
    localWebhookReachable = probe.ok;
  } catch {
    localWebhookReachable = false;
  }

  console.log(
    JSON.stringify(
      {
        ok: json.ok,
        webhook_url: r.url ?? null,
        webhook_empty: !r.url,
        pending_updates: r.pending_update_count ?? 0,
        last_error: r.last_error_message ?? null,
        last_error_date: r.last_error_date
          ? new Date(r.last_error_date * 1000).toISOString()
          : null,
        expected_production_url: expectedProduction,
        url_matches_production:
          expectedProduction != null && r.url === expectedProduction,
        local_dev_webhook_url: localUrl,
        local_webhook_get_ok: localWebhookReachable,
        local_dev_hint:
          !r.url || localWebhookReachable
            ? "Run: npm run dev (terminal 1) + npm run telegram:poll (terminal 2)"
            : "Webhook points to remote host — use telegram:poll for localhost OR re-register webhook",
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
