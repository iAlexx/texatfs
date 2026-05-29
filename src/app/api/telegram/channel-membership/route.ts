import { NextResponse } from "next/server";
import { validateTelegramInitData, parseTelegramUserId } from "@/lib/telegram/validate-init-data";
import { checkTelegramChannelMembership } from "@/lib/telegram/channel-gate";
import { isAdmin } from "@/lib/telegram/bot-api";

export const dynamic = "force-dynamic";

interface Body {
  initData?: string;
  telegramUserId?: number;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const isDev = process.env.NODE_ENV === "development";

  let telegramUserId = body.telegramUserId ?? null;

  if (body.initData && body.initData !== "dev-mode") {
    if (!botToken) {
      return NextResponse.json({ error: "Bot not configured" }, { status: 500 });
    }
    if (!validateTelegramInitData(body.initData, botToken)) {
      return NextResponse.json({ error: "Invalid initData" }, { status: 401 });
    }
    telegramUserId = parseTelegramUserId(body.initData) ?? telegramUserId;
  } else if (!isDev) {
    return NextResponse.json({ error: "Auth required" }, { status: 401 });
  }

  if (!telegramUserId && process.env.NEXT_PUBLIC_DEV_TELEGRAM_ID) {
    telegramUserId = Number(process.env.NEXT_PUBLIC_DEV_TELEGRAM_ID);
  }

  if (!telegramUserId) {
    return NextResponse.json({ error: "Missing telegram user" }, { status: 400 });
  }

  if (isAdmin(telegramUserId)) {
    return NextResponse.json({ ok: true, member: true, status: "administrator" });
  }

  const check = await checkTelegramChannelMembership(telegramUserId);
  return NextResponse.json({
    ok: check.ok,
    member: check.ok,
    status: check.status,
    channel: process.env.TELEGRAM_NEWS_CHANNEL ?? "@Texas0NEWS",
  });
}
