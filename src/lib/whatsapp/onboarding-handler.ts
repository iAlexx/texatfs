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
  WHATSAPP_NO_ACCOUNT_REPLY_AR,
  WHATSAPP_VERIFIED_REPLY_AR,
} from "@/lib/whatsapp/activation-message";
import {
  setOnboardingStatus,
  type OnboardingStatus,
} from "@/lib/whatsapp/onboarding-users";
import { findUserByWhatsAppPhone, buildWhatsAppPhoneLookupCandidates } from "@/lib/whatsapp/onboarding-phone-lookup";
import { scheduleGroupSpawnJob } from "@/lib/whatsapp/group-spawn-job";
import { setWhatsAppOptOut } from "@/lib/whatsapp/opt-out";
import { recordWhatsAppInboundReply } from "@/lib/whatsapp/rate-limiter";
import { scheduleMissingGroupsForParent } from "@/lib/whatsapp/schedule-missing-groups";
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

export interface ActivationDiagnostics {
  whatsappActivationReceived: true;
  normalizedSenderPhone: string;
  lookupCandidates: string[];
  matchedUserId: string | null;
  activationStatusBefore: OnboardingStatus | null;
  activationStatusAfter: OnboardingStatus | null;
  isActivationMessage: boolean;
  dbDirectChildren?: number;
  activeGroupMappings?: number;
  missingGroupTargets?: number;
  groupSpawnScheduled: boolean;
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

    const lookupCandidates = buildWhatsAppPhoneLookupCandidates(phoneDigits);
    const isActivation = isWhatsAppActivationMessage(msg.text);

    log.info("whatsappActivationReceived", {
      normalizedSenderPhone: phoneDigits.slice(-4) + " (masked)",
      lookupCandidatesCount: lookupCandidates.length,
      text: msg.text.slice(0, 20),
      messageId: msg.messageId,
      isActivationMessage: isActivation,
    });

    recordWhatsAppInboundReply();

    const user = await findUserByWhatsAppPhone(supabase, phoneDigits);

    if (!user) {
      log.info("no user found for phone", {
        normalizedSenderPhone: phoneDigits.slice(-4),
        lookupCandidates: lookupCandidates.map((c) => c.slice(-4)),
      });
      if (isActivation) {
        sendDmInBackground(
          msg.chatId,
          WHATSAPP_NO_ACCOUNT_REPLY_AR,
          "no-account-reply"
        );
        return true;
      }
      return false;
    }

    const diagnostics: ActivationDiagnostics = {
      whatsappActivationReceived: true,
      normalizedSenderPhone: phoneDigits,
      lookupCandidates,
      matchedUserId: user.id,
      activationStatusBefore: user.onboarding_status,
      activationStatusAfter: user.onboarding_status,
      isActivationMessage: isActivation,
      groupSpawnScheduled: false,
    };

    if (!isActivation) {
      if (user.onboarding_status === "PENDING_EMOJI") {
        log.info("activation text not matched, sending hint", {
          userId: user.id,
          text: msg.text.slice(0, 30),
        });
        sendDmInBackground(msg.chatId, WHATSAPP_ACTIVATION_HINT_AR, "activation-hint");
        return true;
      }
      return false;
    }

    if (user.onboarding_status === "VERIFIED_COMPLETED") {
      log.info("re-activation on verified user — scheduling missing groups", {
        userId: user.id,
      });
      await setWhatsAppOptOut(supabase, user.id, false);
      if (user.whatsapp_phone) {
        const { data: directChildren } = await supabase
          .from("users")
          .select("id, texas_affiliate_id, display_name, texas_username, role, is_active")
          .eq("parent_id", user.id)
          .eq("is_active", true);

        const schedule = await scheduleMissingGroupsForParent(
          supabase,
          user.id,
          user.whatsapp_phone,
          directChildren ?? [],
          "whatsapp/onboarding-reactivation"
        );
        diagnostics.dbDirectChildren = schedule.dbDirectChildren;
        diagnostics.activeGroupMappings = schedule.activeGroupMappings;
        diagnostics.missingGroupTargets = schedule.missingGroupTargets;
        diagnostics.groupSpawnScheduled = schedule.scheduled;
        sendDmInBackground(msg.chatId, WHATSAPP_VERIFIED_REPLY_AR, "re-verify-reply");
      }
      log.info("activation diagnostics", { ...diagnostics });
      return true;
    }

    if (user.onboarding_status !== "PENDING_EMOJI") {
      log.info("user not in PENDING_EMOJI state", {
        userId: user.id,
        currentStatus: user.onboarding_status,
      });
      return false;
    }

    log.info("WhatsApp activation verified", { userId: user.id });

    await setWhatsAppOptOut(supabase, user.id, false);
    await setOnboardingStatus(supabase, user.id, "VERIFIED_COMPLETED");
    diagnostics.activationStatusAfter = "VERIFIED_COMPLETED";

    sendDmInBackground(msg.chatId, WHATSAPP_VERIFIED_REPLY_AR, "verification-reply");

    if (!user.whatsapp_phone) {
      log.error("user missing whatsapp_phone after match", { userId: user.id });
      log.info("activation diagnostics", { ...diagnostics });
      return true;
    }

    log.info("scheduling group spawn after user-initiated verification", {
      userId: user.id,
    });
    scheduleGroupSpawnJob(supabase, user.id, user.whatsapp_phone);
    diagnostics.groupSpawnScheduled = true;

    const { data: directChildren } = await supabase
      .from("users")
      .select("id, texas_affiliate_id, display_name, texas_username, role, is_active")
      .eq("parent_id", user.id)
      .eq("is_active", true);

    const schedule = await scheduleMissingGroupsForParent(
      supabase,
      user.id,
      user.whatsapp_phone,
      directChildren ?? [],
      "whatsapp/onboarding"
    );
    diagnostics.dbDirectChildren = schedule.dbDirectChildren;
    diagnostics.activeGroupMappings = schedule.activeGroupMappings;
    diagnostics.missingGroupTargets = schedule.missingGroupTargets;

    log.info("activation diagnostics", { ...diagnostics });

    return true;
  } catch (err) {
    log.error("handler error (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
      chatId: msg.chatId.slice(0, 15),
    });
    return false;
  }
}
