"use client";

import { useMutation } from "@tanstack/react-query";
import { useTelegram } from "@/components/providers/TelegramProvider";

export function useRepairTexasCredentials() {
  const { initData, telegramUserId } = useTelegram();

  return useMutation({
    mutationFn: async (input: { texasLogin: string; texasPassword: string }) => {
      const res = await fetch("/api/texas/repair-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData,
          telegramUserId,
          texasLogin: input.texasLogin,
          texasPassword: input.texasPassword,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      return data;
    },
  });
}
