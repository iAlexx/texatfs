"use client";

import Script from "next/script";
import { notifyTelegramScriptLoaded } from "@/lib/telegram/webapp-client";

export function TelegramScript() {
  return (
    <Script
      src="https://telegram.org/js/telegram-web-app.js"
      strategy="beforeInteractive"
      onLoad={notifyTelegramScriptLoaded}
    />
  );
}
