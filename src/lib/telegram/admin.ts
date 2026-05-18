import type { SupabaseClient } from "@supabase/supabase-js";
import { botAr } from "@/lib/i18n/bot-ar";
import { sendTelegramMessage } from "@/lib/telegram/bot-api";

export type LicenseDuration = "1" | "3" | "6" | "12";

const VALID_DURATIONS = new Set<LicenseDuration>(["1", "3", "6", "12"]);

export function parseGenkeyArgs(text: string): LicenseDuration | null {
  const parts = text.trim().split(/\s+/);
  const duration = parts[1] as LicenseDuration | undefined;
  if (!duration || !VALID_DURATIONS.has(duration)) return null;
  return duration;
}

export async function handleGenkeyCommand(
  supabase: SupabaseClient,
  chatId: number,
  text: string
): Promise<void> {
  const duration = parseGenkeyArgs(text);
  if (!duration) {
    await sendTelegramMessage(chatId, botAr.genkeyUsage);
    return;
  }

  const { data, error } = await supabase.rpc("generate_license_key", {
    p_duration_months: duration,
    p_created_by: null,
    p_notes: `Generated via Telegram bot`,
  });

  if (error) {
    await sendTelegramMessage(chatId, botAr.genkeyFailed(error.message));
    return;
  }

  await sendTelegramMessage(
    chatId,
    botAr.genkeySuccess(duration, String(data)),
    { parse_mode: "HTML" }
  );
}
