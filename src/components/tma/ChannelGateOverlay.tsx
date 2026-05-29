"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Loader2 } from "lucide-react";
import { useTelegram } from "@/components/providers/TelegramProvider";
import { Button } from "@/components/ui/button";
import { ar } from "@/lib/i18n/ar";

const CHANNEL_URL = "https://t.me/Texas0NEWS";

export function ChannelGateOverlay() {
  const telegram = useTelegram();
  const [checking, setChecking] = useState(true);
  const [member, setMember] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const verify = useCallback(async () => {
    if (!telegram.canAuthenticate) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/telegram/channel-membership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData: telegram.initData,
          telegramUserId: telegram.telegramUserId ?? undefined,
        }),
      });
      const data = (await res.json()) as { member?: boolean; ok?: boolean };
      const ok = Boolean(data.member ?? data.ok);
      setMember(ok);
      if (!ok) setError(ar.channelVerifyFailed);
    } catch {
      setMember(false);
      setError(ar.errorGeneric);
    } finally {
      setChecking(false);
    }
  }, [telegram.canAuthenticate, telegram.initData, telegram.telegramUserId]);

  useEffect(() => {
    if (telegram.isReady && telegram.canAuthenticate) {
      void verify();
    }
  }, [telegram.isReady, telegram.canAuthenticate, verify]);

  if (!telegram.isReady || checking) return null;
  if (member) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/85 p-4 backdrop-blur-md">
      <motion.div
        className="w-full max-w-sm rounded-3xl border border-violet-500/30 bg-gradient-to-b from-[#1a1028] to-obsidian p-6 shadow-[0_0_48px_rgba(139,92,246,0.2)]"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
      >
        <h2 className="text-lg font-bold text-foreground">{ar.channelGateTitle}</h2>
        <p className="mt-2 text-sm text-steel-400">{ar.channelGateBody}</p>
        {error ? <p className="mt-2 text-xs text-rose-400">{error}</p> : null}
        <div className="mt-5 flex flex-col gap-2">
          <Button
            type="button"
            variant="gold"
            className="w-full"
            onClick={() => window.open(CHANNEL_URL, "_blank")}
          >
            <ExternalLink className="h-4 w-4" />
            {ar.channelSubscribe}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={checking}
            onClick={() => void verify()}
          >
            {checking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {ar.channelVerify}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
