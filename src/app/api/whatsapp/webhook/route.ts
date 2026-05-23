/**
 * POST /api/whatsapp/webhook
 *
 *  • Private DMs  → onboarding emoji handshake + group spawn
 *  • Group chats  → cash payment state machine (✅/🛑)
 *
 * Always returns 200 OK quickly; heavy work runs in the background.
 */
import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  normaliseWhatsAppWebhook,
  normaliseWhatsAppPrivateWebhook,
  type RawWhatsAppWebhook,
} from "@/lib/whatsapp/webhook-types";
import { handleWhatsAppCashEvent } from "@/lib/whatsapp/cash-handler";
import { handleWhatsAppOnboardingPrivate } from "@/lib/whatsapp/onboarding-handler";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
export const maxDuration = 10;

async function processWebhookPayload(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  raw: RawWhatsAppWebhook
): Promise<void> {
  const privateMsg = normaliseWhatsAppPrivateWebhook(raw);
  if (privateMsg) {
    try {
      const handled = await handleWhatsAppOnboardingPrivate(supabase, privateMsg);
      if (handled) return;
    } catch (e) {
      console.error(
        "[whatsapp/webhook] onboarding error:",
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  const groupMsg = normaliseWhatsAppWebhook(raw);
  if (groupMsg) {
    try {
      await handleWhatsAppCashEvent(supabase, groupMsg);
    } catch (e) {
      console.error(
        "[whatsapp/webhook] cash handler error:",
        e instanceof Error ? e.message : String(e)
      );
    }
  }
}

export async function POST(request: Request): Promise<Response> {
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

  let raw: RawWhatsAppWebhook;
  try {
    raw = (await request.json()) as RawWhatsAppWebhook;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  void processWebhookPayload(supabase, raw).catch((e) => {
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
