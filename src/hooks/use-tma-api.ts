"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useTelegram } from "@/components/providers/TelegramProvider";

function authBody(initData: string, telegramUserId: number | null) {
  return {
    initData,
    telegramUserId: telegramUserId ?? undefined,
  };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export interface HeroData {
  user: {
    display_name: string | null;
    texas_username: string | null;
    role: string;
    subscription_end_date: string | null;
    subscription_active: boolean;
  };
  ledger_date: string;
  performance_rating: string | null;
  ai_insight: string;
  ledger_status: string | null;
  al_nihai: number | null;
  announcement: string;
  synced_today: boolean;
  last_sync_at: string | null;
  vault: {
    days7: number;
    days30: number;
    series: { date: string; cumulative_net: number }[];
  };
  network_total_burn: number | null;
  network_agent_count: number;
}

export function useHeroData() {
  const { initData, telegramUserId, isReady, canAuthenticate } = useTelegram();
  return useQuery({
    queryKey: ["app", "hero"],
    enabled: isReady && canAuthenticate,
    queryFn: () =>
      postJson<HeroData>("/api/app/hero", authBody(initData, telegramUserId)),
    staleTime: 30_000,
  });
}

export function useExportReport() {
  const { initData, telegramUserId } = useTelegram();
  return useMutation({
    mutationFn: (params: { targetUserId?: string; ledgerDate?: string }) =>
      postJson<{ ok: boolean; message: string }>("/api/ledger/export", {
        ...authBody(initData, telegramUserId),
        ...params,
      }),
  });
}

export function useRedeemLicense() {
  const { initData, telegramUserId } = useTelegram();
  return useMutation({
    mutationFn: (licenseKey: string) =>
      postJson<{ ok: boolean; subscription_end_date: string | null }>(
        "/api/profile/redeem",
        { ...authBody(initData, telegramUserId), licenseKey }
      ),
  });
}

export function useReferralData() {
  const { initData, telegramUserId, isReady, canAuthenticate } = useTelegram();
  return useQuery({
    queryKey: ["profile", "referral"],
    enabled: isReady && canAuthenticate,
    queryFn: () =>
      postJson<{
        referral_code: string;
        invited_count: number;
        reward_days: number;
      }>("/api/profile/referral", authBody(initData, telegramUserId)),
  });
}

