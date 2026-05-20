"use client";

import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTelegram } from "@/components/providers/TelegramProvider";

function authBody(initData: string, telegramUserId: number | null) {
  return { initData, telegramUserId: telegramUserId ?? undefined };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export type WhatsAppStatus =
  | "disconnected"
  | "creating"
  | "connecting"
  | "connected"
  | "error";

export interface WhatsAppStatusResponse {
  ok: boolean;
  status: WhatsAppStatus;
  phone_number: string | null;
  connected_at: string | null;
  fire_groups_count: number;
}

export interface WhatsAppConnectResponse {
  ok: boolean;
  instanceName: string;
  pairingCode: string;
}

const STATUS_QUERY_KEY = "whatsapp-status";

/** Fetch current WhatsApp status + fire groups count. */
export function useWhatsAppStatus() {
  const { initData, telegramUserId, isReady, canAuthenticate } = useTelegram();

  return useQuery({
    queryKey: [STATUS_QUERY_KEY, initData],
    enabled: isReady && canAuthenticate,
    queryFn: () =>
      postJson<WhatsAppStatusResponse>("/api/whatsapp/status", {
        ...authBody(initData, telegramUserId),
      }),
    staleTime: 10_000,
    gcTime: 60_000,
    retry: 1,
  });
}

/**
 * Start WhatsApp connection — returns pairing code.
 * Begins polling status every 3s automatically.
 */
export function useWhatsAppConnect() {
  const { initData, telegramUserId } = useTelegram();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (phone: string) =>
      postJson<WhatsAppConnectResponse>("/api/whatsapp/connect", {
        ...authBody(initData, telegramUserId),
        phone,
      }),
    onSuccess: () => {
      // Force status re-fetch immediately
      void queryClient.invalidateQueries({ queryKey: [STATUS_QUERY_KEY] });
    },
  });
}

/** Disconnect the WhatsApp instance. */
export function useWhatsAppDisconnect() {
  const { initData, telegramUserId } = useTelegram();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      postJson<{ ok: boolean }>("/api/whatsapp/disconnect", {
        ...authBody(initData, telegramUserId),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [STATUS_QUERY_KEY] });
    },
  });
}

/**
 * Auto-polls status every `intervalMs` while `shouldPoll` is true.
 * Returns a cleanup-safe poll control.
 */
export function useWhatsAppStatusPoller(
  shouldPoll: boolean,
  intervalMs = 3000
) {
  const { initData, telegramUserId } = useTelegram();
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!shouldPoll) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: [STATUS_QUERY_KEY] });
    }, intervalMs);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [shouldPoll, intervalMs, queryClient, initData, telegramUserId]);
}
