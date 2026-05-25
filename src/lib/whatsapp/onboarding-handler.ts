/**
 * Private-chat onboarding: strict 😎 handshake → verified → safe group spawn.
 *
 * All DB writes complete before WhatsApp replies or Texas/Puppeteer work.
 * Group spawning runs in an isolated background job (see group-spawn-job.ts).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from "@/lib/observability/logger";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { jidToPhoneDigits } from "@/lib/whatsapp/phone";
import {
  getUserByWhatsAppPhone,
  setOnboardingStatus,
} from "@/lib/whatsapp/onboarding-users";
import { scheduleGroupSpawnJob } from "@/lib/whatsapp/group-spawn-job";
import type { WhatsAppPrivateMessage } from "@/lib/whatsapp/webhook-types";

const log = createLogger("whatsapp/onboarding");

const VERIFY_EMOJI = "\u{1F60E}";

const REMINDER_DM =
  "⚠️ عذراً يا غالي، يرجى إرسال  ( 😎 ) فقط لتفعيل النظام وبدء إنشاء المجموعات تلقائياً.";

const VERIFIED_DM =
  "✅ تم التحقق بنجاح تام! جاري الآن تهيئة وإنشاء مجموعات التتبع الخاصة بوكلائك أوتوماتيكياً بأمان وبشكل تدريجي...";

function containsVerifyEmoji(text: string): boolean {
  if (!text) return false;
  if (text.trim() === VERIFY_EMOJI) return true;
  return text.includes(VERIFY_EMOJI);
}

function sendDmInBackground(chatId: string, text: string, label: string): void {
  void sendWhatsAppMessage(chatId, text).catch((e) => {
    log.warn(`${label} DM failed`, {
      chatId: chatId.slice(0, 15),
      error: e instanceof Error ? e.message : String(e),
    });
  });
}

/**
 * Handles inbound private (DM) messages for the registration handshake.
 * Returns true when the message was consumed by onboarding logic.
 */
export async function handleWhatsAppOnboardingPrivate(
  supabase: SupabaseClient,
  msg: WhatsAppPrivateMessage
): Promise<boolean> {
  try {
    // WASenderAPI provides cleanedSenderPn directly; fall back to JID parsing
    const phoneDigits = msg.senderPhone ?? jidToPhoneDigits(msg.chatId);
    if (!phoneDigits) {
      log.warn("could not extract phone digits", {
        chatId: msg.chatId,
        senderPhone: msg.senderPhone,
      });
      return false;
    }

    log.info("onboarding DM received", {
      phone: phoneDigits.slice(-4),
      text: msg.text.slice(0, 20),
      messageId: msg.messageId,
      chatIdSuffix: msg.chatId.split("@")[1] ?? "unknown",
      usedCleanedPn: !!msg.senderPhone,
    });

    const user = await getUserByWhatsAppPhone(supabase, phoneDigits);
    if (!user) {
      log.info("no user found for phone", { phone: phoneDigits.slice(-4) });
      return false;
    }

    log.info("user found", {
      userId: user.id,
      onboardingStatus: user.onboarding_status,
      hasPhone: !!user.whatsapp_phone,
    });

    if (user.onboarding_status !== "PENDING_EMOJI") {
      log.info("user not in PENDING_EMOJI state, ignoring", {
        userId: user.id,
        currentStatus: user.onboarding_status,
      });
      return false;
    }

    if (!containsVerifyEmoji(msg.text)) {
      log.info("message does not contain 😎, sending reminder", {
        userId: user.id,
        text: msg.text.slice(0, 30),
      });
      sendDmInBackground(msg.chatId, REMINDER_DM, "reminder reply");
      return true;
    }

    log.info("😎 emoji verified, updating status", { userId: user.id });

    await setOnboardingStatus(supabase, user.id, "VERIFIED_COMPLETED");

    log.info("onboarding status set to VERIFIED_COMPLETED", { userId: user.id });

    sendDmInBackground(msg.chatId, VERIFIED_DM, "verification reply");

    if (!user.whatsapp_phone) {
      log.error("user missing whatsapp_phone after match", { userId: user.id });
      return true;
    }

    log.info("scheduling group spawn", { userId: user.id });
    scheduleGroupSpawnJob(supabase, user.id, user.whatsapp_phone);

    return true;
  } catch (err) {
    log.error("handler error (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
      chatId: msg.chatId.slice(0, 15),
    });
    return false;
  }
}
