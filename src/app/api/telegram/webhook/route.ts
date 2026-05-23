export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
/** Puppeteer onboarding can exceed default serverless limits on some hosts. */
export const maxDuration = 300;

import { NextResponse } from "next/server";
import type { TelegramUpdate } from "@/lib/telegram/bot-api";
import { captureError } from "@/lib/observability/capture-error";
import { createLogger } from "@/lib/observability/logger";
import {
  recordWebhookFailure,
} from "@/lib/observability/webhook-events";
import { shouldProcessWebhookEvent } from "@/lib/observability/webhook-dedup";
import { parseTelegramUpdate } from "@/lib/validation/telegram";

const log = createLogger("telegram/webhook");

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const header = request.headers.get("x-telegram-bot-api-secret-token");
    if (header !== secret) {
      log.warn("rejected: secret token mismatch", { requestId });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseTelegramUpdate(raw);
  if (!parsed.ok) {
    log.warn("invalid update payload", { requestId, error: parsed.error });
    return NextResponse.json({ ok: true, skipped: true });
  }

  const update = parsed.data;
  if (!shouldProcessWebhookEvent("telegram", String(update.update_id))) {
    log.info("duplicate update skipped", { requestId, updateId: update.update_id });
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const [{ getSupabaseServiceClient }, { processTelegramUpdate }] =
    await Promise.all([
      import("@/lib/supabase/server"),
      import("@/lib/telegram/process-update"),
    ]);

  const supabase = getSupabaseServiceClient();
  const processAsync = process.env.TELEGRAM_WEBHOOK_ASYNC !== "false";

  const handleError = (e: unknown) => {
    const msg = e instanceof Error ? e.message : "Webhook error";
    log.error("handler failed", { requestId, error: msg });
    recordWebhookFailure({
      source: "telegram",
      step: "processUpdate",
      message: msg,
      requestId,
    });
    void captureError(e, { scope: "telegram/webhook", requestId });
  };

  if (processAsync) {
    void processTelegramUpdate(supabase, update as TelegramUpdate).catch(handleError);
    return NextResponse.json({ ok: true });
  }

  try {
    await processTelegramUpdate(supabase, update as TelegramUpdate);
    return NextResponse.json({ ok: true });
  } catch (e) {
    handleError(e);
    const msg = e instanceof Error ? e.message : "Webhook error";
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
