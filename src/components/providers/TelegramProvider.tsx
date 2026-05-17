"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface TelegramContextValue {
  initData: string;
  telegramUserId: number | null;
  isReady: boolean;
  displayName: string;
}

const TelegramContext = createContext<TelegramContextValue | null>(null);

export function TelegramProvider({ children }: { children: ReactNode }) {
  const [initData, setInitData] = useState("");
  const [telegramUserId, setTelegramUserId] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [displayName, setDisplayName] = useState("TEXAS FUNDS");

  const bootstrap = useCallback(() => {
    const wa = window.Telegram?.WebApp;
    if (wa) {
      wa.ready();
      wa.expand();
      wa.setHeaderColor("#0a0e17");
      wa.setBackgroundColor("#0a0e17");
      setInitData(wa.initData ?? "");
      const user = wa.initDataUnsafe?.user;
      if (user?.id) setTelegramUserId(user.id);
      if (user?.first_name) {
        setDisplayName(
          [user.first_name, user.last_name].filter(Boolean).join(" ")
        );
      }
    } else if (process.env.NEXT_PUBLIC_DEV_TELEGRAM_ID) {
      setTelegramUserId(Number(process.env.NEXT_PUBLIC_DEV_TELEGRAM_ID));
      setInitData("dev-mode");
    }
    setIsReady(true);
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const value = useMemo(
    () => ({ initData, telegramUserId, isReady, displayName }),
    [initData, telegramUserId, isReady, displayName]
  );

  return (
    <TelegramContext.Provider value={value}>{children}</TelegramContext.Provider>
  );
}

export function useTelegram() {
  const ctx = useContext(TelegramContext);
  if (!ctx) {
    throw new Error("useTelegram must be used within TelegramProvider");
  }
  return ctx;
}
