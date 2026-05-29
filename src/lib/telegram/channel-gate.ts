import {
  answerCallbackQuery,
  getChatMember,
  isAdmin,
  sendTelegramMessage,
  type TelegramInlineKeyboard,
} from "@/lib/telegram/bot-api";

const DEFAULT_CHANNEL = "@Texas0NEWS";

export function resolveNewsChannelId(): string {
  return (
    process.env.TELEGRAM_NEWS_CHANNEL?.trim() ||
    process.env.TELEGRAM_REQUIRED_CHANNEL?.trim() ||
    DEFAULT_CHANNEL
  );
}

export type ChannelMembershipStatus =
  | "member"
  | "administrator"
  | "creator"
  | "left"
  | "kicked"
  | "restricted"
  | "unknown";

export function isChannelMemberStatus(status: string): boolean {
  return status === "member" || status === "administrator" || status === "creator";
}

export async function checkTelegramChannelMembership(
  telegramUserId: number
): Promise<{ ok: boolean; status: ChannelMembershipStatus }> {
  if (isAdmin(telegramUserId)) {
    return { ok: true, status: "administrator" };
  }

  try {
    const member = await getChatMember(resolveNewsChannelId(), telegramUserId);
    const status = (member.status ?? "unknown") as ChannelMembershipStatus;
    return { ok: isChannelMemberStatus(status), status };
  } catch (err) {
    console.warn("[channel-gate] getChatMember failed", {
      telegramUserId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, status: "unknown" };
  }
}

export function channelGateKeyboard(): TelegramInlineKeyboard {
  const channel = resolveNewsChannelId().replace(/^@/, "");
  return {
    inline_keyboard: [
      [
        {
          text: "📢 اشترك بالقناة",
          url: `https://t.me/${channel}`,
        },
      ],
      [{ text: "✅ تحققت", callback_data: "ch:verify" }],
    ],
  };
}

export async function sendChannelGateMessage(chatId: number, text: string): Promise<void> {
  await sendTelegramMessage(chatId, text, {
    reply_markup: channelGateKeyboard(),
  });
}

export async function handleChannelVerifyCallback(
  chatId: number,
  telegramUserId: number,
  callbackQueryId: string,
  onVerified: () => Promise<void>
): Promise<void> {
  const check = await checkTelegramChannelMembership(telegramUserId);
  if (!check.ok) {
    await answerCallbackQuery(callbackQueryId, "لسا ما اشتركت");
    return;
  }
  await answerCallbackQuery(callbackQueryId, "تمام ✅");
  await onVerified();
}
