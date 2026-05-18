import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { AppUser } from "@/lib/supabase/database.types";
import { SubscriptionService } from "@/lib/subscription/SubscriptionService";
import {
  parseTelegramUserId,
  validateTelegramInitData,
} from "@/lib/telegram/validate-init-data";
import type { LedgerAuthInput } from "@/lib/ledger/types";

export class LedgerAuthError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 404 | 402 | 500 = 401
  ) {
    super(message);
    this.name = "LedgerAuthError";
  }
}

export interface ResolvedLedgerUser {
  user: AppUser;
  subscriptionActive: boolean;
}

export async function resolveLedgerUser(
  input: LedgerAuthInput
): Promise<ResolvedLedgerUser> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const isDev = process.env.NODE_ENV === "development";
  let telegramId = input.telegramUserId ?? null;

  if (input.initData && input.initData !== "dev-mode") {
    if (!botToken) {
      throw new LedgerAuthError("TELEGRAM_BOT_TOKEN not configured", 500);
    }
    if (!validateTelegramInitData(input.initData, botToken)) {
      throw new LedgerAuthError(
        "بيانات تيليغرام غير صالحة. تأكد من فتح التطبيق من نفس البوت المسجّل.",
        401
      );
    }
    telegramId = parseTelegramUserId(input.initData) ?? telegramId;
  } else if (!isDev) {
    throw new LedgerAuthError(
      "مطلوب تسجيل الدخول عبر تيليغرام. افتح التطبيق من البوت.",
      401
    );
  }

  if (!telegramId && process.env.NEXT_PUBLIC_DEV_TELEGRAM_ID) {
    telegramId = Number(process.env.NEXT_PUBLIC_DEV_TELEGRAM_ID);
  }

  if (!telegramId) {
    throw new LedgerAuthError("Could not resolve Telegram user", 400);
  }

  const supabase = getSupabaseServiceClient();
  const subscription = new SubscriptionService(supabase);

  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select(
      "id, telegram_id, role, display_name, texas_username, subscription_end_date"
    )
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (userError) throw userError;
  if (!userRow) {
    throw new LedgerAuthError(
      "User not linked to Telegram account. Send /start to the bot.",
      404
    );
  }

  const subscriptionActive = await subscription.isActive(userRow.id);

  const user: AppUser = {
    id: userRow.id,
    telegram_id: userRow.telegram_id,
    role: userRow.role,
    display_name: userRow.display_name,
    texas_username: userRow.texas_username,
    subscription_end_date: userRow.subscription_end_date,
    subscription_active: subscriptionActive,
  };

  return { user, subscriptionActive };
}
