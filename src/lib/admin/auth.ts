import { isAdmin, parseAdminIds } from "@/lib/telegram/bot-api";
import {
  parseTelegramUserId,
  validateTelegramInitData,
} from "@/lib/telegram/validate-init-data";

export type LicenseDurationMonths = "week" | "1" | "3" | "6" | "12";

export const LICENSE_DURATIONS: LicenseDurationMonths[] = [
  "week",
  "1",
  "3",
  "6",
  "12",
];

export interface AdminAuthInput {
  initData?: string;
  telegramUserId?: number;
}

export interface AdminAuthResult {
  telegramUserId: number;
  isAdmin: true;
}

export class AdminAuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 | 400 | 500 = 401
  ) {
    super(message);
    this.name = "AdminAuthError";
  }
}

/** Resolve Telegram user id from initData / dev fallback (same pattern as ledger API). */
export function resolveTelegramUserId(input: AdminAuthInput): number | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const isDev = process.env.NODE_ENV === "development";
  let telegramId = input.telegramUserId ?? null;

  if (input.initData && input.initData !== "dev-mode") {
    if (!botToken) return null;
    if (!validateTelegramInitData(input.initData, botToken)) return null;
    telegramId = parseTelegramUserId(input.initData) ?? telegramId;
  } else if (!isDev) {
    return null;
  }

  if (!telegramId && process.env.NEXT_PUBLIC_DEV_TELEGRAM_ID) {
    telegramId = Number(process.env.NEXT_PUBLIC_DEV_TELEGRAM_ID);
  }

  return telegramId;
}

/** Throws AdminAuthError if caller is not in TELEGRAM_ADMIN_IDS. */
export function requireAdmin(input: AdminAuthInput): AdminAuthResult {
  const telegramUserId = resolveTelegramUserId(input);

  if (!telegramUserId) {
    throw new AdminAuthError(
      "Telegram authentication required. Open /admin from Telegram or set dev admin ID.",
      401
    );
  }

  if (!isAdmin(telegramUserId)) {
    throw new AdminAuthError("Access denied. Super Admin Telegram ID required.", 403);
  }

  return { telegramUserId, isAdmin: true };
}

export function getConfiguredAdminIds(): number[] {
  return [...parseAdminIds()];
}
