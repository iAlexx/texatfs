import type { SupabaseClient } from "@supabase/supabase-js";
import { handleGenkeyCommand } from "@/lib/telegram/admin";
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
 */
export async function processTelegramUpdate(
  supabase: SupabaseClient,
  update: TelegramUpdate
): Promise<void> {
  const message = update.message;
  if (!message?.text || !message.from) {
    devLog("skip", { reason: "no text or from", update_id: update.update_id });
    return;
  }

  const text = message.text.trim();
  const telegramUserId = message.from.id;

  devLog("message", {
    update_id: update.update_id,
    telegramUserId,
    chatId: message.chat.id,
    textPreview: text.slice(0, 80),
  });

  if (text.startsWith("/genkey")) {
    if (!isAdmin(telegramUserId)) {
      devLog("genkeyDenied", { telegramUserId });
      return;
    }
    await handleGenkeyCommand(supabase, message.chat.id, text);
    return;
  }

  await handleOnboardingMessage(supabase, message);
}
