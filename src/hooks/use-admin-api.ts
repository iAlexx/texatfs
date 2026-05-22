"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTelegram } from "@/components/providers/TelegramProvider";
import type { AdminUsersResponse, GenerateLicenseResponse } from "@/lib/admin/types";
import type { LicenseDurationMonths } from "@/lib/admin/auth";

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

export function useAdminSession() {
  const { initData, telegramUserId, isReady, canAuthenticate } = useTelegram();

  return useQuery({
    queryKey: ["admin", "me", telegramUserId],
    enabled: isReady && canAuthenticate,
    queryFn: () =>
      postJson<{ ok: boolean; telegramUserId: number }>("/api/admin/me", {
        ...authBody(initData, telegramUserId),
      }),
    staleTime: 300_000, // 5 min — no need to re-verify admin status on every navigation
    retry: false,
  });
}

export function useAdminUsers(page = 1, search = "") {
  const { initData, telegramUserId, isReady, canAuthenticate } = useTelegram();

  return useQuery({
    queryKey: ["admin", "users", page, search],
    enabled: isReady && canAuthenticate,
    queryFn: () =>
      postJson<AdminUsersResponse>("/api/admin/users", {
        ...authBody(initData, telegramUserId),
        page,
        limit: 20,
        search: search || undefined,
      }),
    staleTime: 60_000,   // 1 min — avoids re-fetching when switching tabs
    placeholderData: (prev) => prev, // keep previous page data while next loads
  });
}

export function useGenerateLicense() {
  const { initData, telegramUserId } = useTelegram();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      durationMonths: LicenseDurationMonths;
      notes?: string;
    }) =>
      postJson<GenerateLicenseResponse>("/api/admin/licenses/generate", {
        ...authBody(initData, telegramUserId),
        durationMonths: params.durationMonths,
        notes: params.notes,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}
