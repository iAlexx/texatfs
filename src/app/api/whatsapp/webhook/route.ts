/**
 * POST /api/whatsapp/webhook
 *
 * Receives events from the centralised WhatsApp gateway.
 *
 *  Security:
 *    The header `x-webhook-secret` (or `X-Webhook-Secret`) MUST equal
 *    process.env.WHATSAPP_WEBHOOK_SECRET when that env var is set.
 *
 *  Behaviour:
 *    The route MUST return a 200 OK in < 1.5 s — message processing is
 *    fired in the background to prevent gateway retries.
 *
 *  Filtering:
 *    Only events whose normalised groupId ends with "@g.us" (group chats)
 *    are processed. The cash handler further checks event types and
 *    pending-confirmation matches.
 */
import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  normaliseWhatsAppWebhook,
  type RawWhatsAppWebhook,
} from "@/lib/whatsapp/webhook-types";
import { handleWhatsAppCashEvent } from "@/lib/whatsapp/cash-handler";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
/** Webhook must reply fast; background work is intentional. */
export const maxDuration = 10;

const GROUP_EVENT_PREFIXES = ["messages-group", "message.received", "message"];

export async function POST(request: Request): Promise<Response> {
  // ── 1. Secret guard ────────────────────────────────────────────────────────
  const expected = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (expected) {
    const provided =
      request.headers.get("x-webhook-secret") ??
      request.headers.get("x-webhook-signature");
    if (provided !== expected) {
      console.warn("[whatsapp/webhook] rejected: secret mismatch");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // ── 2. Parse body ──────────────────────────────────────────────────────────
  let raw: RawWhatsAppWebhook;
  try {
    raw = (await request.json()) as RawWhatsAppWebhook;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ── 3. Normalise & ack instantly ──────────────────────────────────────────
  const msg = normaliseWhatsAppWebhook(raw);
  if (!msg) {
    // Non-message event (e.g. status updates) — ack and ignore.
    return NextResponse.json({ ok: true, ignored: "no message data" });
  }

  // Only handle group-message events (private chats are explicitly skipped
  // by the groupId/@g.us check inside normaliseWhatsAppWebhook too).
  const isGroupEvent =
    msg.eventType === "" ||
    GROUP_EVENT_PREFIXES.some((p) => msg.eventType.startsWith(p));

  if (!isGroupEvent) {
    return NextResponse.json({ ok: true, ignored: "non-group event" });
  }

  // ── 4. Fire-and-forget processing ─────────────────────────────────────────
  const supabase = getSupabaseServiceClient();
  void handleWhatsAppCashEvent(supabase, msg).catch((e) => {
    console.error(
      "[whatsapp/webhook] async handler error:",
      e instanceof Error ? e.message : String(e)
    );
  });

  return NextResponse.json({ ok: true });
}

export async function GET(): Promise<Response> {
  return NextResponse.json({
    status: "TEXAS FUNDS WhatsApp webhook",
    ok: true,
    secured: Boolean(process.env.WHATSAPP_WEBHOOK_SECRET),
  });
}
