/**
 * Phone number normalisation for WhatsApp gateway JIDs.
 */
import {
  DEFAULT_COUNTRY_CODE,
  findCountryDialCode,
  type CountryDialCode,
} from "@/lib/whatsapp/country-codes";

/** Strip to digits only (E.164 without +). */
export function normalizePhoneDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

export interface NormalizeWhatsAppPhoneResult {
  digits: string;
  countryCode: string;
  valid: boolean;
  error?: string;
}

/**
 * Normalize local or full number to E.164 digits (no +).
 * Preserves numbers that are already fully qualified (7–15 digits).
 */
export function normalizeWhatsAppPhone(
  countryCode: string,
  localNumber: string
): NormalizeWhatsAppPhoneResult {
  const cc = normalizePhoneDigits(countryCode) || DEFAULT_COUNTRY_CODE;
  let digits = normalizePhoneDigits(localNumber);

  if (!digits) {
    return { digits: "", countryCode: cc, valid: false, error: "empty" };
  }

  if (digits.startsWith("0")) {
    digits = digits.replace(/^0+/, "");
  }

  const country = findCountryDialCode(cc);
  const alreadyHasCc =
    digits.startsWith(cc) && digits.length > cc.length + 6;

  if (!alreadyHasCc && digits.length <= (country?.maxNationalLength ?? 10)) {
    digits = cc + digits;
  }

  const valid = isValidPhoneDigits(digits);
  return {
    digits,
    countryCode: cc,
    valid,
    error: valid ? undefined : "invalid_length",
  };
}

export { DEFAULT_COUNTRY_CODE, findCountryDialCode, type CountryDialCode };

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
