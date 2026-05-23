/**
 * Private-chat onboarding: strict 😎 handshake → verified → safe group spawn.
 *
 * All DB writes complete before WhatsApp replies or Texas/Puppeteer work.
 * Group spawning runs in an isolated background job (see group-spawn-job.ts).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { jidToPhoneDigits } from "@/lib/whatsapp/phone";
import {
  getUserByWhatsAppPhone,
  setOnboardingStatus,
} from "@/lib/whatsapp/onboarding-users";
import { scheduleGroupSpawnJob } from "@/lib/whatsapp/group-spawn-job";
import type { WhatsAppPrivateMessage } from "@/lib/whatsapp/webhook-types";

/** U+1F60E — must match exactly what we ask users to send in the welcome DM. */
const VERIFY_EMOJI = "\u{1F60E}";

const REMINDER_DM =
  "⚠️ عذراً يا غالي، يرجى إرسال  ( 😎 ) فقط لتفعيل النظام وبدء إنشاء المجموعات تلقائياً.";

const VERIFIED_DM =
  "✅ تم التحقق بنجاح تام! جاري الآن تهيئة وإنشاء مجموعات التتبع الخاصة بوكلائك أوتوماتيكياً بأمان وبشكل تدريجي...";

/**
 * True only when the payload contains the sunglasses emoji (😎).
 * Handles optional whitespace and surrounding text from WhatsApp clients.
 */
function containsVerifyEmoji(text: string): boolean {
  if (!text) return false;
  if (text.trim() === VERIFY_EMOJI) return true;
  return text.includes(VERIFY_EMOJI);
}

function sendDmInBackground(chatId: string, text: string, label: string): void {
  void sendWhatsAppMessage(chatId, text).catch((e) => {
    console.error(
      `[onboarding] ${label} failed:`,
      e instanceof Error ? e.message : String(e)
    );
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
    const phoneDigits = jidToPhoneDigits(msg.chatId);
    if (!phoneDigits) return false;

    const user = await getUserByWhatsAppPhone(supabase, phoneDigits);
    if (!user) return false;

    if (user.onboarding_status !== "PENDING_EMOJI") {
      return false;
    }

    if (!containsVerifyEmoji(msg.text)) {
      sendDmInBackground(msg.chatId, REMINDER_DM, "reminder reply");
      return true;
    }

    // DB first — must survive Chromium OOM elsewhere in the process.
    await setOnboardingStatus(supabase, user.id, "VERIFIED_COMPLETED");

    sendDmInBackground(msg.chatId, VERIFIED_DM, "verification reply");

    if (!user.whatsapp_phone) {
      console.error(
        "[onboarding] user missing whatsapp_phone after match",
        user.id
      );
      return true;
    }

    scheduleGroupSpawnJob(supabase, user.id, user.whatsapp_phone);

    return true;
  } catch (err) {
    console.error(
      "[onboarding] handler error (non-fatal):",
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}
