/**
 * Phone number normalisation for WhatsApp gateway JIDs.
 */

/** Strip to digits only (E.164 without +). */
export function normalizePhoneDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Validate international mobile length (7–15 digits after normalisation).
 */
export function isValidPhoneDigits(digits: string): boolean {
  return /^\d{7,15}$/.test(digits);
}

/** WhatsApp user JID from stored digits, e.g. 963988899474@s.whatsapp.net */
export function phoneToWhatsAppJid(digits: string): string {
  const d = normalizePhoneDigits(digits);
  return `${d}@s.whatsapp.net`;
}

/** Extract digit string from an incoming WhatsApp JID or bare number. */
export function jidToPhoneDigits(jidOrPhone: string): string {
  const bare = jidOrPhone.split("@")[0] ?? jidOrPhone;
  return normalizePhoneDigits(bare);
}
