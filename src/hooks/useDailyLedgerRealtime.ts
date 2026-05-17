"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient, mapLedgerRow } from "@/lib/supabase/client";
import type { LedgerSessionResponse } from "@/lib/supabase/database.types";
import { useTelegram } from "@/components/providers/TelegramProvider";

interface UseDailyLedgerResult {
  data: LedgerSessionResponse | null;
  loading: boolean;
  error: string | null;
  subscriptionExpired: boolean;
  refresh: () => Promise<void>;
}

export function useDailyLedgerRealtime(
  ledgerDate?: string
): UseDailyLedgerResult {
  const { initData, telegramUserId, isReady } = useTelegram();
  const [data, setData] = useState<LedgerSessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscriptionExpired, setSubscriptionExpired] = useState(false);

  const fetchLedger = useCallback(async () => {
    if (!isReady) return;

    setLoading(true);
    setError(null);
    setSubscriptionExpired(false);

    try {
      const res = await fetch("/api/ledger/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData,
          telegramUserId,
          ledgerDate,
        }),
      });

      const json = (await res.json()) as LedgerSessionResponse & {
        error?: string;
      };

      if (res.status === 402) {
        setData(json);
        setSubscriptionExpired(true);
        return;
      }

      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }

      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load ledger");
    } finally {
      setLoading(false);
    }
  }, [initData, telegramUserId, ledgerDate, isReady]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  useEffect(() => {
    if (!data?.user.id || subscriptionExpired) return;

    let supabase: ReturnType<typeof getSupabaseBrowserClient>;
    try {
      supabase = getSupabaseBrowserClient();
    } catch {
      return;
    }

    const channel = supabase
      .channel(`ledger-${data.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "daily_ledgers",
          filter: `user_id=eq.${data.user.id}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null;
          if (!row?.id || !data.ledger) return;
          setData((prev) =>
            prev?.ledger
              ? {
                  ...prev,
                  ledger: mapLedgerRow(row),
                }
              : prev
          );
        }
      )
      .subscribe();

    const pollMs = Number(process.env.NEXT_PUBLIC_LEDGER_POLL_MS ?? 15000);
    const pollId = setInterval(() => {
      if (data.ledger?.status === "open") fetchLedger();
    }, pollMs);

    return () => {
      clearInterval(pollId);
      supabase.removeChannel(channel);
    };
  }, [data?.user.id, data?.ledger?.status, subscriptionExpired, fetchLedger]);

  return {
    data,
    loading,
    error,
    subscriptionExpired,
    refresh: fetchLedger,
  };
}
