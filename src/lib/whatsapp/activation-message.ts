/** User-initiated WhatsApp onboarding activation phrases. */
const ACTIVATION_EXACT = new Set([
  "\u{1F60E}", // 😎
  "تفعيل",
  "تم",
  "start",
  "START",
  "Start",
]);

export function isWhatsAppActivationMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  if (ACTIVATION_EXACT.has(trimmed)) return true;

  const lower = trimmed.toLowerCase();
  if (lower === "start" || lower === "تفعيل" || lower === "تم") return true;

  if (trimmed === "\u{1F60E}" || trimmed.includes("\u{1F60E}")) return true;

  return false;
}

export const WHATSAPP_ACTIVATION_HINT_AR =
  "أرسل 😎 أو كلمة «تفعيل» إلى رقم البوت في واتساب لإكمال التفعيل.";

export const WHATSAPP_VERIFIED_REPLY_AR =
  "تم تفعيل رقم الواتساب بنجاح ✅";

export const WHATSAPP_NO_ACCOUNT_REPLY_AR =
  "لم نجد حساب مرتبط بهذا الرقم. افتح البوت واضغط تغيير رقم الواتساب ثم أرسل رسالة التفعيل مرة ثانية.";
