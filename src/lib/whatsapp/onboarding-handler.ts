/**
 * Private-chat onboarding: strict 😎 handshake → verified → safe group spawn.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { jidToPhoneDigits } from "@/lib/whatsapp/phone";
import {
  getUserByWhatsAppPhone,
  setOnboardingStatus,
} from "@/lib/whatsapp/onboarding-users";
import { spawnAgentGroupsForMaster } from "@/lib/whatsapp/group-spawner";
import type { WhatsAppPrivateMessage } from "@/lib/whatsapp/webhook-types";

/** U+1F60E — must match exactly what we ask users to send in the welcome DM. */
const VERIFY_EMOJI = "\u{1F60E}";

const REMINDER_DM =
  "⚠️ عذراً يا غالي، يرجى إرسال  ( 😎 ) فقط لتفعيل النظام وبدء إنشاء المجموعات تلقائياً.";

/**
 * True only when the payload contains the sunglasses emoji (😎).
 * Handles optional whitespace and surrounding text from WhatsApp clients.
 */
function containsVerifyEmoji(text: string): boolean {
  if (!text) return false;
  // Direct match (most common: user sends only 😎)
  if (text.trim() === VERIFY_EMOJI) return true;
  // Substring match (e.g. reply context or rare multi-part payloads)
  return text.includes(VERIFY_EMOJI);
}

/**
 * Handles inbound private (DM) messages for the registration handshake.
 * Returns true when the message was consumed by onboarding logic.
 */
export async function handleWhatsAppOnboardingPrivate(
  supabase: SupabaseClient,
  msg: WhatsAppPrivateMessage
): Promise<boolean> {
  const phoneDigits = jidToPhoneDigits(msg.chatId);
  if (!phoneDigits) return false;

  const user = await getUserByWhatsAppPhone(supabase, phoneDigits);
  if (!user) return false;

  if (user.onboarding_status !== "PENDING_EMOJI") {
    return false;
  }

  if (!containsVerifyEmoji(msg.text)) {
    await sendWhatsAppMessage(msg.chatId, REMINDER_DM).catch((e) => {
      console.error(
        "[onboarding] reminder reply failed:",
        e instanceof Error ? e.message : String(e)
      );
    });
    return true;
  }

  await setOnboardingStatus(supabase, user.id, "VERIFIED_COMPLETED");

  await sendWhatsAppMessage(
    msg.chatId,
    "✅ تم التحقق بنجاح تام! جاري الآن تهيئة وإنشاء مجموعات التتبع الخاصة بوكلائك أوتوماتيكياً بأمان وبشكل تدريجي..."
  ).catch((e) => {
    console.error(
      "[onboarding] verification reply failed:",
      e instanceof Error ? e.message : String(e)
    );
  });

  if (!user.whatsapp_phone) {
    console.error("[onboarding] user missing whatsapp_phone after match", user.id);
    return true;
  }

  void spawnAgentGroupsForMaster(supabase, user.id, user.whatsapp_phone).catch(
    (e) => {
      console.error(
        "[onboarding] group spawn failed:",
        e instanceof Error ? e.message : String(e)
      );
    }
  );

  return true;
}
