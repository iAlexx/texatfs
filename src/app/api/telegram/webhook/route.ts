import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { handleGenkeyCommand } from "@/lib/telegram/admin";
import {
  isAdmin,
  type TelegramUpdate,
} from "@/lib/telegram/bot-api";
import { handleOnboardingMessage } from "@/lib/telegram/onboarding";

export async function POST(request: Request) {
  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret) {
      const header = request.headers.get("x-telegram-bot-api-secret-token");
      if (header !== secret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const update = (await request.json()) as TelegramUpdate;
    const message = update.message;
    if (!message?.text || !message.from) {
      return NextResponse.json({ ok: true });
    }

    const supabase = getSupabaseServiceClient();
    const text = message.text.trim();
    const telegramUserId = message.from.id;

    if (text.startsWith("/genkey")) {
      if (!isAdmin(telegramUserId)) {
        return NextResponse.json({ ok: true });
      }
      await handleGenkeyCommand(supabase, message.chat.id, text);
      return NextResponse.json({ ok: true });
    }

    await handleOnboardingMessage(supabase, message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Webhook error";
    console.error("[telegram/webhook]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "TEXAS FUNDS Telegram webhook",
    ok: true,
  });
}
