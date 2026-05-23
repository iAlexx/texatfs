"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTelegram } from "@/components/providers/TelegramProvider";
import type { OnboardingStatus } from "@/lib/whatsapp/onboarding-users";

export interface WhatsAppOnboardingStatus {
  onboardingStatus: OnboardingStatus;
  whatsappPhone: string | null;
  groupCount: number;
}

export interface RegisterPhoneResult {
  success: boolean;
  phone: string;
  onboardingStatus: OnboardingStatus;
}

async function fetchOnboardingStatus(
  telegramId: number
): Promise<WhatsAppOnboardingStatus> {
  const res = await fetch(
    `/api/whatsapp/onboarding-status?telegram_id=${telegramId}`,
    { cache: "no-store" }
  );
  const data = (await res.json()) as WhatsAppOnboardingStatus & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export function useWhatsAppOnboardingStatus(
  telegramId: number | null | undefined
) {
  return useQuery<WhatsAppOnboardingStatus>({
    queryKey: ["whatsapp", "onboarding", "status", telegramId],
    enabled: !!telegramId,
    queryFn: () => fetchOnboardingStatus(telegramId!),
    refetchInterval: (q) => {
      const s = q.state.data?.onboardingStatus;
      if (s === "PENDING_EMOJI") return 5_000;
      if (s === "VERIFIED_COMPLETED") return 30_000;
      return false;
    },
    staleTime: 10_000,
  });
}

export function useRegisterWhatsAppPhone() {
  const { initData, telegramUserId } = useTelegram();
  const queryClient = useQueryClient();

  return useMutation<
    RegisterPhoneResult,
    Error,
    { phone: string; countryCode: string }
  >({
    mutationFn: async ({ phone, countryCode }) => {
      const res = await fetch("/api/whatsapp/register-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, telegramUserId, phone, countryCode }),
      });
      const data = (await res.json()) as RegisterPhoneResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      return data as RegisterPhoneResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["whatsapp", "onboarding", "status"],
      });
    },
  });
}
