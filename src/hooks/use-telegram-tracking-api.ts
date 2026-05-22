"use client";

import { useQuery } from "@tanstack/react-query";

export interface TrackingStatus {
  active: boolean;
  chatTitle: string | null;
  chatId: number | null;
  topicCount: number;
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
    // Poll every 5s while not active (waiting for bot to be added to group)
    // Once active, refresh every 30s (just to stay current)
    refetchInterval: (query) =>
      query.state.data?.active ? 30_000 : 5_000,
    staleTime: 10_000,
    retry: 2,
  });
}
