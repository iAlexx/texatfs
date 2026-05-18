import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { processTelegramUpdate } from "@/lib/telegram/process-update";
import type { TelegramUpdate } from "@/lib/telegram/bot-api";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
/** Puppeteer onboarding can exceed default serverless limits on some hosts. */
export const maxDuration = 300;

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const header = request.headers.get("x-telegram-bot-api-secret-token");
    if (header !== secret) {
      console.warn("[telegram/webhook] rejected: secret token mismatch");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();

  // Telegram requires a fast 200; Puppeteer sign-in can take 1–3 minutes.
  const processAsync = process.env.TELEGRAM_WEBHOOK_ASYNC !== "false";

  if (processAsync) {
    void processTelegramUpdate(supabase, update).catch((e) => {
      const msg = e instanceof Error ? e.message : "Webhook error";
      console.error("[telegram/webhook] async handler failed", msg, e);
    });
    return NextResponse.json({ ok: true });
  }

  try {
    await processTelegramUpdate(supabase, update);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Webhook error";
    console.error("[telegram/webhook]", msg, e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "TEXAS FUNDS Telegram webhook",
    ok: true,
    async: process.env.TELEGRAM_WEBHOOK_ASYNC !== "false",
  });
}
