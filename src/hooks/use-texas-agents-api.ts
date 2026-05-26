"use client";

import { useQuery } from "@tanstack/react-query";
import { useTelegram } from "@/components/providers/TelegramProvider";
import type { DailyLedger } from "@/lib/supabase/database.types";
import type { TexasSubAgentsPayload } from "@/lib/texas/texas-live-sub-agents";
import type { NetworkPayload } from "@/lib/hierarchy/types";

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

/**
 * Sub-agents list — data is live from Texas API.
 * staleTime: 30s matches server-side cache TTL.
 * Pass forceRefresh=true to bypass both client and server caches.
 */
export function useTexasSubAgents(
  ledgerDate: string,
  enabled: boolean,
  forceRefresh = false
) {
  const { initData, telegramUserId, isReady, canAuthenticate } = useTelegram();

  return useQuery({
    queryKey: ["texas", "sub-agents", ledgerDate, telegramUserId, initData],
    enabled: isReady && canAuthenticate && enabled,
    queryFn: () =>
      postJson<TexasSubAgentsPayload>("/api/texas/sub-agents", {
        ...authBody(initData, telegramUserId),
        ledgerDate,
        forceRefresh: forceRefresh || undefined,
      }),
    staleTime: 30_000,   // matches server TTL — prevents double-fetch but shows fresh data
    gcTime:    5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: true,  // refresh when user returns to tab
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

/**
 * Deep-dive for a single agent — always fetches live data.
 * staleTime: 0 means React Query always re-fetches when the component mounts
 * or the window regains focus. No stale stats from the list view are sent.
 */
/**
 * DB-backed network data — direct children with ledgers and children counts.
 * Used by the Sub-Agents tab for accurate, hierarchy-aware data.
 */
export function useNetworkData(
  ledgerDate: string,
  enabled: boolean,
  directOnly = true
) {
  const { initData, telegramUserId, isReady, canAuthenticate } = useTelegram();

  return useQuery({
    queryKey: ["network", ledgerDate, directOnly, telegramUserId, initData],
    enabled: isReady && canAuthenticate && enabled,
    queryFn: () =>
      postJson<NetworkPayload>("/api/ledger/get-network", {
        ...authBody(initData, telegramUserId),
        ledgerDate,
        directOnly,
        syncStale: false,
      }),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: true,
  });
}

export function useTexasAgentDetail(
  affiliateId: string | null,
  ledgerDate: string,
  currencyCode?: string
) {
  const { initData, telegramUserId, isReady, canAuthenticate } = useTelegram();

  return useQuery({
    queryKey: [
      "texas",
      "agent-detail",
      affiliateId,
      ledgerDate,
      currencyCode,
      telegramUserId,
      initData,
    ],
    enabled: isReady && canAuthenticate && Boolean(affiliateId?.trim()),
    queryFn: () =>
      postJson<TexasAgentDetailResponse>("/api/texas/agent-detail", {
        ...authBody(initData, telegramUserId),
        affiliateId,
        ledgerDate,
        currencyCode,
        // No cached stats passed — server always fetches fresh
      }),
    staleTime: 0,          // always re-fetch on mount / window focus
    gcTime:    60_000,
    retry: 1,
    refetchOnWindowFocus: true,
  });
}
