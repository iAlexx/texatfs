import type { SupabaseClient } from "@supabase/supabase-js";
import { getWhatsAppBotConfigForClient } from "@/lib/whatsapp/bot-config";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp/phone";
import { setUserWhatsAppPhone } from "@/lib/whatsapp/onboarding-users";

export interface RegisterPhoneInput {
  userId: string;
  phone: string;
  countryCode: string;
}

export interface RegisterPhoneResult {
  success: true;
  phone: string;
  onboardingStatus: "PENDING_EMOJI";
  botWhatsappNumber: string | null;
  whatsappActivationUrl: string | null;
  instructionText: string;
  botNumberConfigured: boolean;
}

export async function registerWhatsAppPhone(
  supabase: SupabaseClient,
  input: RegisterPhoneInput
): Promise<RegisterPhoneResult> {
  const normalized = normalizeWhatsAppPhone(input.countryCode, input.phone);

  if (!normalized.valid) {
    throw new Error("INVALID_PHONE");
  }

  const digits = normalized.digits;

  const { data: phoneOwner } = await supabase
    .from("users")
    .select("id")
    .eq("whatsapp_phone", digits)
    .neq("id", input.userId)
    .maybeSingle();

  if (phoneOwner) {
    throw new Error("PHONE_IN_USE");
  }

  await setUserWhatsAppPhone(supabase, input.userId, digits, "PENDING_EMOJI");

  const botConfig = getWhatsAppBotConfigForClient();

  return {
    success: true,
    phone: digits,
    onboardingStatus: "PENDING_EMOJI",
    ...botConfig,
  };
}
