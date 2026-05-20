"use client";

import { useQuery } from "@tanstack/react-query";
import { useTelegram } from "@/components/providers/TelegramProvider";
import type { DailyLedger } from "@/lib/supabase/database.types";
import type { TexasSubAgentsPayload } from "@/lib/texas/texas-live-sub-agents";

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
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return data;
}

export function useTexasSubAgents(
  ledgerDate: string,
  enabled: boolean,
  forceRefresh = false
) {
  const { initData, telegramUserId, isReady, canAuthenticate } = useTelegram();

  return useQuery({
    queryKey: ["texas", "sub-agents", ledgerDate, initData],
    enabled: isReady && canAuthenticate && enabled,
    queryFn: () =>
      postJson<TexasSubAgentsPayload>("/api/texas/sub-agents", {
        ...authBody(initData, telegramUserId),
        ledgerDate,
        forceRefresh: forceRefresh || undefined,
      }),
    staleTime: 90_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });
}

export interface TexasAgentDetailResponse {
  affiliate_id: string;
  username: string;
  email: string;
  main_currency: string;
  ledger: DailyLedger;
  source: "texas_api";
}

export function useTexasAgentDetail(
  affiliateId: string | null,
  ledgerDate: string,
  currencyCode?: string,
  /** Pre-fetched stats from list view (reduces API calls to 1) */
  cachedStats?: { username?: string; tebat?: number; suhoubat?: number; al_harq?: number }
) {
  const { initData, telegramUserId, isReady, canAuthenticate } = useTelegram();

  return useQuery({
    queryKey: [
      "texas",
      "agent-detail",
      affiliateId,
      ledgerDate,
      currencyCode,
      initData,
    ],
    enabled: isReady && canAuthenticate && Boolean(affiliateId?.trim()),
    queryFn: () =>
      postJson<TexasAgentDetailResponse>("/api/texas/agent-detail", {
        ...authBody(initData, telegramUserId),
        affiliateId,
        ledgerDate,
        currencyCode,
        // Pass cached stats so server skips redundant Texas API calls
        ...(cachedStats?.tebat !== undefined
          ? {
              username: cachedStats.username,
              tebat: cachedStats.tebat,
              suhoubat: cachedStats.suhoubat,
              al_harq: cachedStats.al_harq,
            }
          : {}),
      }),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });
}
