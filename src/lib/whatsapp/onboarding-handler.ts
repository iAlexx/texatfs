/**
 * Private-chat onboarding: emoji handshake → verified → safe group spawn.
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

const EMOJI_OR_SMILE_RE =
  /[\p{Extended_Pictographic}\u{1F300}-\u{1FAFF}]/u;

const SMILE_TEXT_RE = /(?:^|[\s])(?:[:;=][-~]?[)DdpP]|:\)|:-\)|;-\)|:\]|:\(|:\(|xD|XD)(?:[\s]|$)/i;

function isEmojiHandshake(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (EMOJI_OR_SMILE_RE.test(t)) return true;
  if (SMILE_TEXT_RE.test(t)) return true;
  return false;
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

  if (!isEmojiHandshake(msg.text)) {
    return false;
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
