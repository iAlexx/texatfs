/**
 * POST /api/whatsapp/webhook
 *
 *  • Private DMs  → onboarding emoji handshake + group spawn
 *  • Group chats  → cash payment state machine (✅/🛑)
 *
 * Always returns 200 OK quickly; heavy work runs in the background.
 */
import { NextResponse } from "next/server";
import { captureError } from "@/lib/observability/capture-error";
import { createLogger } from "@/lib/observability/logger";
import { recordWebhookFailure } from "@/lib/observability/webhook-events";
import { shouldProcessWebhookEvent } from "@/lib/observability/webhook-dedup";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  normaliseWhatsAppWebhook,
  normaliseWhatsAppPrivateWebhook,
} from "@/lib/whatsapp/webhook-types";
import { parseWhatsAppWebhook, type ParsedWhatsAppWebhook } from "@/lib/validation/whatsapp";
import { runWithRequestContext } from "@/lib/observability/request-context";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
export const maxDuration = 10;

const log = createLogger("whatsapp/webhook");

async function processWebhookPayload(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  raw: ParsedWhatsAppWebhook,
  requestId: string
): Promise<void> {
  // Resolve the actual message data — WASenderAPI nests under data.messages
  const rawData = raw.data as Record<string, unknown> | undefined;
  const msgObj = (rawData?.messages ?? rawData ?? raw) as Record<string, unknown>;
  const keyObj = (msgObj.key ?? {}) as Record<string, unknown>;
  const chatId = keyObj.remoteJid ?? msgObj.chatId ?? msgObj.remoteJid ?? msgObj.from ?? "";
  const body = msgObj.messageBody ?? msgObj.body ?? msgObj.text ?? "";
  const author = keyObj.participant ?? keyObj.cleanedParticipantPn ?? msgObj.author ?? msgObj.senderId ?? "";

  log.info("webhook payload received", {
    requestId,
    event: raw.event ?? raw.type ?? "unknown",
    chatId: String(chatId).slice(0, 50),
    author: String(author).slice(0, 30),
    body: String(body).slice(0, 60),
    isGroup: String(chatId).endsWith("@g.us"),
    isPrivate: String(chatId).endsWith("@s.whatsapp.net") || String(chatId).endsWith("@c.us"),
    isLid: String(chatId).endsWith("@lid"),
    hasDataMessages: !!rawData?.messages,
    topLevelKeys: Object.keys(raw).sort().join(","),
    dataKeys: rawData ? Object.keys(rawData).sort().join(",") : "none",
    msgKeys: typeof msgObj === "object" ? Object.keys(msgObj).sort().join(",") : "none",
  });

  const [{ handleWhatsAppOnboardingPrivate }, { handleWhatsAppCashEvent }] =
    await Promise.all([
      import("@/lib/whatsapp/onboarding-handler"),
      import("@/lib/whatsapp/cash-handler"),
    ]);

  // --- Private DM: onboarding ---
  const privateMsg = normaliseWhatsAppPrivateWebhook(raw as import("@/lib/whatsapp/webhook-types").RawWhatsAppWebhook);
  if (privateMsg) {
    log.info("private message normalised", {
      requestId,
      chatId: privateMsg.chatId,
      text: privateMsg.text.slice(0, 40),
      messageId: privateMsg.messageId,
    });

    if (
      !(await shouldProcessWebhookEvent(
        "whatsapp",
        `private:${privateMsg.messageId}`,
        supabase
      ))
    ) {
      log.info("duplicate private message skipped", {
        requestId,
        messageId: privateMsg.messageId,
      });
      return;
    }

    try {
      const handled = await handleWhatsAppOnboardingPrivate(supabase, privateMsg);
      log.info("onboarding result", { requestId, handled });
      if (handled) return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error("onboarding error", { requestId, error: msg });
      recordWebhookFailure({
        source: "whatsapp",
        step: "onboarding",
        message: msg,
        requestId,
      });
      void captureError(e, { scope: "whatsapp/webhook", requestId, tags: { step: "onboarding" } });
    }
  }

  // --- Group message: cash handler ---
  const groupMsg = normaliseWhatsAppWebhook(raw as import("@/lib/whatsapp/webhook-types").RawWhatsAppWebhook);
  if (groupMsg) {
    log.info("group message normalised", {
      requestId,
      groupId: groupMsg.groupId,
      senderId: groupMsg.senderId,
      text: groupMsg.text.slice(0, 60),
      messageId: groupMsg.messageId,
      quotedMessageId: groupMsg.quotedMessageId,
    });

    if (
      !(await shouldProcessWebhookEvent(
        "whatsapp",
        `group:${groupMsg.messageId}`,
        supabase
      ))
    ) {
      log.info("duplicate group message skipped", {
        requestId,
        messageId: groupMsg.messageId,
      });
      return;
    }

    try {
      const handled = await handleWhatsAppCashEvent(supabase, groupMsg);
      log.info("cash handler result", { requestId, handled, groupId: groupMsg.groupId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error("cash handler error", { requestId, error: msg });
      recordWebhookFailure({
        source: "whatsapp",
        step: "cash",
        message: msg,
        requestId,
      });
      void captureError(e, { scope: "whatsapp/webhook", requestId, tags: { step: "cash" } });
    }
  }

  if (!privateMsg && !groupMsg) {
    log.warn("message not normalised as private or group", {
      requestId,
      chatId: String(chatId).slice(0, 50),
      chatIdSuffix: String(chatId).split("@")[1] ?? "no-@",
      event: raw.event ?? raw.type ?? "unknown",
      hasDataMessages: !!rawData?.messages,
      bodyPreview: String(body).slice(0, 40),
    });
  }
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();

  return runWithRequestContext({ requestId, scope: "whatsapp/webhook" }, async () => {

  const expected = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (expected) {
    const provided =
      request.headers.get("x-webhook-secret") ??
      request.headers.get("x-webhook-signature");
    if (provided !== expected) {
      log.warn("rejected: secret mismatch", { requestId });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let rawJson: unknown;
  try {
    rawJson = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  log.info("webhook raw", {
    requestId,
    type: typeof rawJson,
    keys: rawJson && typeof rawJson === "object" ? Object.keys(rawJson as Record<string, unknown>).join(",") : "non-object",
  });

  const parsed = parseWhatsAppWebhook(rawJson);
  if (!parsed.ok) {
    log.warn("invalid webhook payload", { requestId, error: parsed.error });
    return NextResponse.json({ ok: true, skipped: true });
  }

  const supabase = getSupabaseServiceClient();
  void runWithRequestContext({ requestId, scope: "whatsapp/webhook" }, () =>
    processWebhookPayload(supabase, parsed.data, requestId).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      log.error("async handler error", { requestId, error: msg });
      recordWebhookFailure({
        source: "whatsapp",
        step: "async",
        message: msg,
        requestId,
      });
      void captureError(e, { scope: "whatsapp/webhook", requestId });
    })
  );

  return NextResponse.json({ ok: true });
  });
}

export async function GET(): Promise<Response> {
  return NextResponse.json({
    status: "TEXAS FUNDS WhatsApp webhook",
    ok: true,
    secured: Boolean(process.env.WHATSAPP_WEBHOOK_SECRET),
  });
}
