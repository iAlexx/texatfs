"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTelegram } from "@/components/providers/TelegramProvider";
import { getSupabaseBrowserClient, mapLedgerRow } from "@/lib/supabase/client";
import type { LedgerHistoryResponse } from "@/lib/ledger/types";
import type { LedgerSessionResponse } from "@/lib/supabase/database.types";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

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

export function useLedgerHistory() {
  const { initData, telegramUserId, isReady, canAuthenticate } = useTelegram();

  return useQuery({
    queryKey: ["ledger", "history"],
    enabled: isReady && canAuthenticate,
    queryFn: () =>
      postJson<LedgerHistoryResponse>("/api/ledger/history", {
        ...authBody(initData, telegramUserId),
      }),
    staleTime: 60_000,
  });
}

export function useLedgerSession(
  ledgerDate: string,
  viewUserId?: string | null,
  options?: { forceSync?: boolean; syncNetwork?: boolean; viewMode?: "daily" | "monthly" }
) {
  const { initData, telegramUserId, isReady, canAuthenticate } = useTelegram();
  const queryClient = useQueryClient();
  const isToday = ledgerDate === todayIsoDate();

  const query = useQuery({
    queryKey: [
      "ledger",
      "daily",
      ledgerDate,
      viewUserId ?? "self",
      options?.forceSync ?? false,
      options?.syncNetwork ?? false,
      options?.viewMode ?? "monthly",
    ],
    enabled: isReady && canAuthenticate && !!ledgerDate,
    queryFn: async () => {
      const res = await fetch("/api/ledger/get-ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...authBody(initData, telegramUserId),
          ledgerDate,
          target_user_id: viewUserId ?? undefined,
          agent_id: viewUserId ?? undefined,
          forceSync: options?.forceSync === true,
          syncNetwork: options?.syncNetwork === true,
          viewMode: options?.viewMode ?? "daily",
        }),
      });

      const json = (await res.json()) as LedgerSessionResponse & {
        error?: string;
      };

      if (res.status === 402) {
        const err = new Error("انتهى الاشتراك") as Error & {
          subscriptionExpired: boolean;
          data: LedgerSessionResponse;
        };
        err.subscriptionExpired = true;
        err.data = json;
        throw err;
      }

      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }

      return json;
    },
    retry: false,
  });

  const userId = query.data?.viewing_user_id ?? query.data?.user.id;
  const ledgerStatus = query.data?.ledger?.status;
  const subscriptionExpired =
    query.error &&
    typeof query.error === "object" &&
    "subscriptionExpired" in query.error &&
    (query.error as { subscriptionExpired?: boolean }).subscriptionExpired;

  const expiredData =
    subscriptionExpired &&
    typeof query.error === "object" &&
    "data" in query.error
      ? (query.error as { data: LedgerSessionResponse }).data
      : null;

  useEffect(() => {
    if (!isToday || !userId || subscriptionExpired) return;

    let supabase: ReturnType<typeof getSupabaseBrowserClient>;
    try {
      supabase = getSupabaseBrowserClient();
    } catch {
      return;
    }

    const channel = supabase
      .channel(`ledger-${userId}-${ledgerDate}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "daily_ledgers",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null;
          if (!row?.id) return;
          const rowDate = String(row.ledger_date ?? "").slice(0, 10);
          if (rowDate !== ledgerDate) return;

          queryClient.setQueryData<LedgerSessionResponse>(
            [
              "ledger",
              "daily",
              ledgerDate,
              viewUserId ?? "self",
              options?.forceSync ?? false,
              options?.syncNetwork ?? false,
              options?.viewMode ?? "monthly",
            ],
            (prev) =>
              prev
                ? { ...prev, ledger: mapLedgerRow(row) }
                : prev
          );
        }
      )
      .subscribe();

    const pollMs = Number(process.env.NEXT_PUBLIC_LEDGER_POLL_MS ?? 15000);
    const viewMode = options?.viewMode ?? "daily";
    const pollId = setInterval(() => {
      if (ledgerStatus === "open") {
        void queryClient.invalidateQueries({
          queryKey: [
            "ledger",
            "daily",
            ledgerDate,
            viewUserId ?? "self",
            options?.forceSync ?? false,
            options?.syncNetwork ?? false,
            viewMode,
          ],
        });
      }
    }, pollMs);

    return () => {
      clearInterval(pollId);
      void supabase.removeChannel(channel);
    };
  }, [
    isToday,
    userId,
    ledgerDate,
    ledgerStatus,
    subscriptionExpired,
    queryClient,
    viewUserId,
    options?.forceSync,
    options?.syncNetwork,
    options?.viewMode,
  ]);

  return {
    data: expiredData ?? query.data ?? null,
    isLoading: query.isLoading,
    error: subscriptionExpired
      ? null
      : query.error instanceof Error
        ? query.error.message
        : query.error
          ? "تعذر تحميل السجل"
          : null,
    subscriptionExpired: Boolean(subscriptionExpired),
    refresh: () => void query.refetch(),
  };
}

export { todayIsoDate };
