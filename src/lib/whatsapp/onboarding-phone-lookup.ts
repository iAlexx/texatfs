import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_COUNTRY_CODE } from "@/lib/whatsapp/phone";
import {
  getUserByWhatsAppPhone,
  type WhatsAppOnboardingUser,
} from "@/lib/whatsapp/onboarding-users";

/** Build candidate E.164 digit strings for inbound sender matching. */
export function buildWhatsAppPhoneLookupCandidates(
  rawDigits: string
): string[] {
  const digits = rawDigits.replace(/\D/g, "");
  if (!digits) return [];

  const out = new Set<string>();
  out.add(digits);

  if (digits.startsWith("0")) {
    const stripped = digits.replace(/^0+/, "");
    if (stripped) out.add(stripped);
    out.add(DEFAULT_COUNTRY_CODE + stripped);
  }

  if (
    !digits.startsWith(DEFAULT_COUNTRY_CODE) &&
    digits.length <= 10
  ) {
    out.add(DEFAULT_COUNTRY_CODE + digits);
  }

  if (digits.startsWith(DEFAULT_COUNTRY_CODE) && digits.length > DEFAULT_COUNTRY_CODE.length + 6) {
    out.add(digits.slice(DEFAULT_COUNTRY_CODE.length));
  }

  return [...out];
}

export async function findUserByWhatsAppPhone(
  supabase: SupabaseClient,
  phoneDigits: string
): Promise<WhatsAppOnboardingUser | null> {
  const candidates = buildWhatsAppPhoneLookupCandidates(phoneDigits);

  for (const candidate of candidates) {
    const user = await getUserByWhatsAppPhone(supabase, candidate);
    if (user) return user;
  }

  return null;
}
