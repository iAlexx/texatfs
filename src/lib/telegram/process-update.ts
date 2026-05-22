import type { SupabaseClient } from "@supabase/supabase-js";
import { handleGenkeyCommand } from "@/lib/telegram/admin";
import {
  handleAdminCallback,
  handleAnnounceCommand,
  sendAdminPanel,
} from "@/lib/telegram/admin-panel";
import { isAdmin, type TelegramUpdate } from "@/lib/telegram/bot-api";
import { handleOnboardingMessage } from "@/lib/telegram/onboarding";
import { initTrackingGroup } from "@/lib/telegram/forum-manager";
import {
  handleCashMessage,
  handleCashCallback,
} from "@/lib/telegram/cash-handler";

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
  // ── Bot added to a Forum supergroup → initialise tracking topics ────────────
  if (update.my_chat_member) {
    const { chat, from, new_chat_member } = update.my_chat_member;

    const botBecameAdmin =
      new_chat_member.status === "administrator" ||
      new_chat_member.status === "member";

    if (botBecameAdmin && chat.type === "supergroup" && chat.is_forum) {
      devLog("my_chat_member:forum", {
        chatId: chat.id,
        chatTitle: chat.title,
        fromId: from.id,
        status: new_chat_member.status,
      });

      const { data: userRow } = await supabase
        .from("users")
        .select("id")
        .eq("telegram_id", from.id)
        .maybeSingle();

      if (userRow?.id) {
        void initTrackingGroup(
          supabase,
          userRow.id,
          chat.id,
          chat.title ?? "Texas Tracking"
        ).catch((e) => {
          console.error(
            "[process-update] initTrackingGroup failed:",
            e instanceof Error ? e.message : String(e)
          );
        });
      } else {
        devLog("my_chat_member:noUser", { fromId: from.id });
      }
    }
    return;
  }

  // ── Callback queries ─────────────────────────────────────────────────────────
  if (update.callback_query) {
    const cq = update.callback_query;
    const data = cq.data ?? "";

    // Cash payment confirm / cancel — any group member may trigger these
    if (data.startsWith("cc|") || data === "cx") {
      await handleCashCallback(supabase, cq);
      return;
    }

    // Admin panel callbacks — restricted to admins
    if (data.startsWith("adm:")) {
      if (!isAdmin(cq.from.id)) {
        devLog("callbackDenied", { telegramUserId: cq.from.id });
        return;
      }
      const chatId   = cq.message?.chat.id;
      const messageId = cq.message?.message_id;
      if (chatId && messageId) {
        await handleAdminCallback(supabase, chatId, messageId, data, cq.id);
      }
    }

    return;
  }

  // ── Messages ─────────────────────────────────────────────────────────────────
  const message = update.message;
  if (!message?.text || !message.from) {
    devLog("skip", { reason: "no text or from", update_id: update.update_id });
    return;
  }

  const text          = message.text.trim();
  const telegramUserId = message.from.id;
  const chatId        = message.chat.id;

  devLog("message", {
    update_id: update.update_id,
    telegramUserId,
    chatId,
    textPreview: text.slice(0, 80),
  });

  // ── Cash triggers: ✅/🛑 in group forum threads ─────────────────────────────
  // Only process in groups (not private chats). handleCashMessage checks
  // message.chat.type internally and returns false for private messages.
  if (message.chat.type !== "private" && message.message_thread_id) {
    const handled = await handleCashMessage(supabase, message);
    if (handled) return;
  }

  // ── Admin commands (private or group) ───────────────────────────────────────
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

  // ── Onboarding (private DMs only) ────────────────────────────────────────────
  await handleOnboardingMessage(supabase, message);
}
