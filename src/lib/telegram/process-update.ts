import type { SupabaseClient } from "@supabase/supabase-js";
import { handleGenkeyCommand } from "@/lib/telegram/admin";
import {
  handleAdminCallback,
  handleAnnounceCommand,
  sendAdminPanel,
} from "@/lib/telegram/admin-panel";
import { isAdmin, type TelegramUpdate } from "@/lib/telegram/bot-api";
import { handleOnboardingMessage } from "@/lib/telegram/onboarding";

function devLog(phase: string, data?: Record<string, unknown>): void {
  if (
    process.env.TELEGRAM_DEV_LOG === "true" ||
    process.env.LOCAL_DEBUG === "true"
  ) {
    console.info(`[telegram-dev] ${phase}`, data ?? {});
  }
}

/**
 * Shared Telegram update handler (webhook + local polling).
 *
 * NOTE: The Telegram Forum Topics tracking system has been removed.
 *       All cash tracking now runs through WhatsApp (`/api/whatsapp/webhook`).
 *       The Telegram bot retains its role as the TMA auth surface and admin
 *       command interface only (/admin, /announce, /genkey, onboarding).
 */
export async function processTelegramUpdate(
  supabase: SupabaseClient,
  update: TelegramUpdate
): Promise<void> {
  // ── Callback queries (admin panel only) ────────────────────────────────────
  if (update.callback_query) {
    const cq   = update.callback_query;
    const data = cq.data ?? "";

    if (data.startsWith("adm:")) {
      if (!isAdmin(cq.from.id)) {
        devLog("callbackDenied", { telegramUserId: cq.from.id });
        return;
      }
      const chatId    = cq.message?.chat.id;
      const messageId = cq.message?.message_id;
      if (chatId && messageId) {
        await handleAdminCallback(supabase, chatId, messageId, data, cq.id);
      }
    }
    return;
  }

  // ── Messages ──────────────────────────────────────────────────────────────
  const message = update.message;
  if (!message?.text || !message.from) {
    devLog("skip", { reason: "no text or from", update_id: update.update_id });
    return;
  }

  const text           = message.text.trim();
  const telegramUserId = message.from.id;
  const chatId         = message.chat.id;

  devLog("message", {
    update_id: update.update_id,
    telegramUserId,
    chatId,
    textPreview: text.slice(0, 80),
  });

  if (text === "/admin" || text.startsWith("/admin@")) {
    if (!isAdmin(telegramUserId)) return;
    await sendAdminPanel(chatId, supabase);
    return;
  }

  if (text.startsWith("/announce")) {
    if (!isAdmin(telegramUserId)) return;
    await handleAnnounceCommand(supabase, chatId, text);
    return;
  }

  if (text.startsWith("/genkey")) {
    if (!isAdmin(telegramUserId)) {
      devLog("genkeyDenied", { telegramUserId });
      return;
    }
    await handleGenkeyCommand(supabase, chatId, text);
    return;
  }

  await handleOnboardingMessage(supabase, message);
}
