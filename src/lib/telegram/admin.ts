import type { SupabaseClient } from "@supabase/supabase-js";
import { botAr } from "@/lib/i18n/bot-ar";
import { sendTelegramMessage } from "@/lib/telegram/bot-api";

/** DB enum value for generate_license_key RPC */
export type LicenseDuration = "week" | "1" | "3" | "6" | "12";

const VALID_MONTHS = new Set<LicenseDuration>(["1", "3", "6", "12"]);

export function parseGenkeyArgs(text: string): LicenseDuration | null {
  const parts = text.trim().split(/\s+/);
  const raw = (parts[1] ?? "").toLowerCase();
  if (!raw) return null;

  if (raw === "week" || raw === "1w" || raw === "7d" || raw === "w") {
    return "week";
  }

  if (VALID_MONTHS.has(raw as LicenseDuration)) {
    return raw as LicenseDuration;
  }

  return null;
}

export function licenseDurationLabel(duration: LicenseDuration): string {
  if (duration === "week") return "أسبوع";
  return `${duration} شهر`;
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
    botAr.genkeySuccess(licenseDurationLabel(duration), String(data)),
    { parse_mode: "HTML" }
  );
}
