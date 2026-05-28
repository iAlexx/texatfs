"use client";

import { useMutation } from "@tanstack/react-query";
import { useTelegram } from "@/components/providers/TelegramProvider";

export function useLogout() {
  const { initData, telegramUserId } = useTelegram();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, telegramUserId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Logout failed (${res.status})`);
      return data;
    },
  });
}
