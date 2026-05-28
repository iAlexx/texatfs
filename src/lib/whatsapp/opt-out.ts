import type { SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from "@/lib/observability/logger";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { jidToPhoneDigits } from "@/lib/whatsapp/phone";

const log = createLogger("whatsapp/opt-out");

const OPT_OUT_EXACT = new Set([
  "stop",
  "STOP",
  "Stop",
  "إيقاف",
  "توقف",
  "stop all",
]);

export const WHATSAPP_OPT_OUT_CONFIRM_AR =
  "تم إيقاف رسائل واتساب لهذا الرقم. يمكنك إعادة التفعيل بإرسال تفعيل.";

export function isWhatsAppOptOutMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (OPT_OUT_EXACT.has(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  return lower === "stop" || lower === "stop all";
}

export async function isWhatsAppOptedOut(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("users")
    .select("whatsapp_opt_out")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data?.whatsapp_opt_out);
}

export async function setWhatsAppOptOut(
  supabase: SupabaseClient,
  userId: string,
  optedOut: boolean
): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({ whatsapp_opt_out: optedOut })
    .eq("id", userId);

  if (error) throw error;
}

export async function getUserByWhatsAppPhoneForOptOut(
  supabase: SupabaseClient,
  phoneDigits: string
): Promise<{ id: string; whatsapp_opt_out: boolean | null } | null> {
  const { data, error } = await supabase
    .from("users")
    .select("id, whatsapp_opt_out")
    .eq("whatsapp_phone", phoneDigits)
    .maybeSingle();

  if (error) throw error;
  return data as { id: string; whatsapp_opt_out: boolean | null } | null;
}

/**
 * Private-chat STOP handler. Returns true when consumed.
 */
export async function handleWhatsAppOptOutPrivate(
  supabase: SupabaseClient,
  input: { chatId: string; senderPhone: string | null; text: string }
): Promise<boolean> {
  if (!isWhatsAppOptOutMessage(input.text)) return false;

  const phoneDigits = input.senderPhone ?? jidToPhoneDigits(input.chatId);
  if (!phoneDigits) return false;

  const user = await getUserByWhatsAppPhoneForOptOut(supabase, phoneDigits);
  if (!user) return false;

  await setWhatsAppOptOut(supabase, user.id, true);
  log.info("WhatsApp opt-out recorded", { userId: user.id, phone: phoneDigits.slice(-4) });

  void sendWhatsAppMessage(input.chatId, WHATSAPP_OPT_OUT_CONFIRM_AR).catch((e) => {
    log.warn("opt-out confirm failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  });

  return true;
}

/** Non-essential outbound (prompts, hints) — skip when opted out. */
export async function assertWhatsAppMessagingAllowed(
  supabase: SupabaseClient,
  userId: string,
  scope: string
): Promise<boolean> {
  const optedOut = await isWhatsAppOptedOut(supabase, userId);
  if (optedOut) {
    log.info("skipped outbound — user opted out", { userId, scope });
    return false;
  }
  return true;
}
