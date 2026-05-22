"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTelegram } from "@/components/providers/TelegramProvider";

export interface TrackingStatus {
  active: boolean;
  chatTitle: string | null;
  chatId: number | null;
  topicCount: number;
  inviteLink: string | null;
}

export interface AutoCreateResult {
  success: boolean;
  chatId: number;
  chatTitle: string;
  groupId: string;
  commandsTopicId: number | null;
  inviteLink: string | null;
}

export interface AutoCreateError extends Error {
  code?: string;
  fallback?: boolean;
  retryAfterSeconds?: number;
}

async function fetchTrackingStatus(telegramId: number): Promise<TrackingStatus> {
  const res = await fetch(
    `/api/telegram/tracking/status?telegram_id=${telegramId}`,
    { cache: "no-store" }
  );
  const data = (await res.json()) as TrackingStatus & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

/**
 * Polls the Telegram tracking status for the current master.
 * Automatically increases the polling interval once the system is active.
 */
export function useTrackingStatus(telegramId: number | null | undefined) {
  return useQuery<TrackingStatus>({
    queryKey: ["telegram", "tracking", "status", telegramId],
    enabled: !!telegramId,
    queryFn: () => fetchTrackingStatus(telegramId!),
    // Poll every 5s while not active (waiting for bot/auto-create to finish)
    // Once active, refresh every 30s
    refetchInterval: (query) =>
      query.state.data?.active ? 30_000 : 5_000,
    staleTime: 10_000,
    retry: 2,
  });
}

/**
 * Triggers the automated 4-step group setup via the Telegram Userbot.
 * On success, the tracking status query is invalidated so the UI updates instantly.
 * On error, the error object carries `code` and `fallback` fields for the UI.
 */
export function useAutoCreateTracking() {
  const { initData, telegramUserId } = useTelegram();
  const queryClient = useQueryClient();

  return useMutation<AutoCreateResult, AutoCreateError>({
    mutationFn: async () => {
      const res = await fetch("/api/telegram/tracking/auto-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, telegramUserId }),
      });

      const data = (await res.json()) as AutoCreateResult & {
        error?: string;
        code?: string;
        fallback?: boolean;
        retryAfterSeconds?: number;
      };

      if (!res.ok) {
        const err = new Error(
          data.error ?? `Request failed (${res.status})`
        ) as AutoCreateError;
        err.code = data.code;
        err.fallback = data.fallback;
        err.retryAfterSeconds = data.retryAfterSeconds;
        throw err;
      }

      return data as AutoCreateResult;
    },
    onSuccess: () => {
      // Invalidate status so polling picks up the new group immediately
      void queryClient.invalidateQueries({
        queryKey: ["telegram", "tracking", "status"],
      });
    },
  });
}
