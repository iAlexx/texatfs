import type { SupabaseClient } from "@supabase/supabase-js";

export type OnboardingStatus =
  | "PENDING_REGISTRATION"
  | "PENDING_EMOJI"
  | "VERIFIED_COMPLETED";

export interface WhatsAppOnboardingUser {
  id: string;
  whatsapp_phone: string | null;
  onboarding_status: OnboardingStatus;
  display_name: string | null;
}

export async function getUserByWhatsAppPhone(
  supabase: SupabaseClient,
  phoneDigits: string
): Promise<WhatsAppOnboardingUser | null> {
  const { data, error } = await supabase
    .from("users")
    .select("id, whatsapp_phone, onboarding_status, display_name")
    .eq("whatsapp_phone", phoneDigits)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return data as WhatsAppOnboardingUser;
}

export async function getOnboardingStatusForUserId(
  supabase: SupabaseClient,
  userId: string
): Promise<WhatsAppOnboardingUser | null> {
  const { data, error } = await supabase
    .from("users")
    .select("id, whatsapp_phone, onboarding_status, display_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return data as WhatsAppOnboardingUser;
}

export async function setUserWhatsAppPhone(
  supabase: SupabaseClient,
  userId: string,
  phoneDigits: string,
  status: OnboardingStatus
): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({
      whatsapp_phone: phoneDigits,
      onboarding_status: status,
    })
    .eq("id", userId);

  if (error) throw error;
}

export async function setOnboardingStatus(
  supabase: SupabaseClient,
  userId: string,
  status: OnboardingStatus
): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({ onboarding_status: status })
    .eq("id", userId);

  if (error) throw error;
}
