/**
 * Register Telegram webhook URL with Bot API.
 * Usage: npm run telegram:webhook -- https://your-domain.com/api/telegram/webhook
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path: string) {
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
  loadEnvFile(resolve(root, ".env.local"));
  loadEnvFile(resolve(root, ".env"));

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = process.argv[2];
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN missing");
  if (!webhookUrl) throw new Error("Usage: npm run telegram:webhook -- <url>");

  const body: Record<string, string> = { url: webhookUrl };
  if (process.env.TELEGRAM_WEBHOOK_SECRET) {
    body.secret_token = process.env.TELEGRAM_WEBHOOK_SECRET;
  }

  const res = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
  if (!json.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
