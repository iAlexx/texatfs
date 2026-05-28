/**
 * Private-chat onboarding: user must message the bot first (anti-spam).
 * Accepts 😎 / تفعيل / تم / start → VERIFIED_COMPLETED → group spawn.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from "@/lib/observability/logger";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { jidToPhoneDigits } from "@/lib/whatsapp/phone";
import {
  isWhatsAppActivationMessage,
  WHATSAPP_ACTIVATION_HINT_AR,
  WHATSAPP_VERIFIED_REPLY_AR,
} from "@/lib/whatsapp/activation-message";
import {
  getUserByWhatsAppPhone,
  setOnboardingStatus,
} from "@/lib/whatsapp/onboarding-users";
import { scheduleGroupSpawnJob } from "@/lib/whatsapp/group-spawn-job";
import type { WhatsAppPrivateMessage } from "@/lib/whatsapp/webhook-types";

const log = createLogger("whatsapp/onboarding");

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
    });

    const user = await getUserByWhatsAppPhone(supabase, phoneDigits);
    if (!user) {
      log.info("no user found for phone — ignored", {
        phone: phoneDigits.slice(-4),
      });
      return false;
    }

    if (user.onboarding_status !== "PENDING_EMOJI") {
      log.info("user not in PENDING_EMOJI state, ignoring", {
        userId: user.id,
        currentStatus: user.onboarding_status,
      });
      return false;
    }

    if (!isWhatsAppActivationMessage(msg.text)) {
      log.info("activation text not matched, sending hint", {
        userId: user.id,
        text: msg.text.slice(0, 30),
      });
      sendDmInBackground(msg.chatId, WHATSAPP_ACTIVATION_HINT_AR, "activation-hint");
      return true;
    }

    log.info("WhatsApp activation verified", { userId: user.id });

    await setOnboardingStatus(supabase, user.id, "VERIFIED_COMPLETED");

    sendDmInBackground(msg.chatId, WHATSAPP_VERIFIED_REPLY_AR, "verification-reply");

    if (!user.whatsapp_phone) {
      log.error("user missing whatsapp_phone after match", { userId: user.id });
      return true;
    }

    log.info("scheduling group spawn after user-initiated verification", {
      userId: user.id,
    });
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
