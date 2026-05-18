/**
 * Remove Telegram webhook (use before local polling).
 * Usage: npm run telegram:webhook:delete
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
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN missing");

  const drop = process.argv.includes("--drop-pending");
  const res = await fetch(
    `https://api.telegram.org/bot${token}/deleteWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: drop }),
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
