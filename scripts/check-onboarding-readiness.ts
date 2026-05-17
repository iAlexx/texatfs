/**
 * Verifies production webhook + required env keys (names only, no values).
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

const REQUIRED = [
  "TELEGRAM_BOT_TOKEN",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CREDENTIALS_ENCRYPTION_KEY",
  "TEXAS_API_BASE_URL",
] as const;

const RECOMMENDED = [
  "TELEGRAM_ADMIN_IDS",
  "TELEGRAM_MINI_APP_URL",
  "LEDGER_TIMEZONE",
] as const;

async function main() {
  const root = resolve(__dirname, "..");
  loadEnv(resolve(root, ".env.local"));

  const envStatus = Object.fromEntries(
    [...REQUIRED, ...RECOMMENDED].map((k) => [
      k,
      Boolean(process.env[k] && process.env[k]!.length > 0),
    ])
  );

  let webhookGet: { ok?: boolean; status?: string } = {};
  try {
    const res = await fetch("https://texatfs.vercel.app/api/telegram/webhook");
    webhookGet = await res.json();
  } catch (e) {
    webhookGet = { ok: false, status: String(e) };
  }

  let supabaseOk = false;
  let supabaseDetail = "";
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      const { error: lk } = await sb.from("license_keys").select("key").limit(1);
      const { error: os } = await sb
        .from("telegram_onboarding_sessions")
        .select("telegram_id")
        .limit(1);
      if (lk?.message?.includes("does not exist") || os?.message?.includes("does not exist")) {
        supabaseDetail = "Migrations missing: license_keys or telegram_onboarding_sessions";
      } else if (lk || os) {
        supabaseDetail = lk?.message ?? os?.message ?? "unknown";
      } else {
        supabaseOk = true;
        supabaseDetail = "Tables reachable";
      }
    } catch (e) {
      supabaseDetail = e instanceof Error ? e.message : "Supabase check failed";
    }
  }

  const requiredOk = REQUIRED.every((k) => envStatus[k]);
  const ready =
    requiredOk &&
    webhookGet.ok === true &&
    supabaseOk;

  console.log(
    JSON.stringify(
      {
        ready_for_onboarding_test: ready,
        production_webhook_get: webhookGet,
        env_configured: envStatus,
        supabase_schema: { ok: supabaseOk, detail: supabaseDetail },
        test_steps: [
          "1. Admin: send /genkey 1 (or 3/6/12) from TELEGRAM_ADMIN_IDS account",
          "2. New Telegram account: send /start to the bot",
          "3. Reply with Texas email, password, then license key",
          "4. Open TMA at TELEGRAM_MINI_APP_URL or /ledger",
        ],
        webhook_secret_note:
          process.env.TELEGRAM_WEBHOOK_SECRET
            ? "TELEGRAM_WEBHOOK_SECRET is set — webhook must be registered with the same secret_token"
            : "TELEGRAM_WEBHOOK_SECRET not set — no header check on webhook",
      },
      null,
      2
    )
  );

  if (!ready) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
