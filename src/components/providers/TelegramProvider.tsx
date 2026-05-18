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
import {
  hasValidTelegramAuth,
  onTelegramScriptLoaded,
  readTelegramAuth,
  type TelegramAuthSnapshot,
} from "@/lib/telegram/webapp-client";

interface TelegramContextValue {
  initData: string;
  telegramUserId: number | null;
  isReady: boolean;
  /** True when initData (or dev-mode) is present — safe to call APIs. */
  canAuthenticate: boolean;
  authError: string | null;
  displayName: string;
  isInsideTelegram: boolean;
}

const TelegramContext = createContext<TelegramContextValue | null>(null);

const BOOTSTRAP_TIMEOUT_MS = 8_000;
const BOOTSTRAP_POLL_MS = 80;

export function TelegramProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<TelegramAuthSnapshot>(() =>
    typeof window !== "undefined"
      ? readTelegramAuth()
      : {
          initData: "",
          telegramUserId: null,
          displayName: "TEXAS FUNDS",
          source: "none",
        }
  );
  const [isReady, setIsReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const applySnapshot = useCallback((next: TelegramAuthSnapshot) => {
    setSnapshot(next);

    if (hasValidTelegramAuth(next)) {
      setAuthError(null);
      return true;
    }
    return false;
  }, []);

  const bootstrap = useCallback(() => {
    const next = readTelegramAuth();
    const wa = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;

    if (wa) {
      wa.setHeaderColor?.("#0a0a0b");
      wa.setBackgroundColor?.("#0a0a0b");
    }

    return applySnapshot(next);
  }, [applySnapshot]);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const finish = (authenticated: boolean) => {
      if (cancelled) return;
      if (!authenticated) {
        setAuthError(
          "افتح التطبيق من زر القائمة داخل بوت تيليغرام (وليس من متصفح خارجي)."
        );
      }
      setIsReady(true);
    };

    if (bootstrap()) {
      finish(true);
    } else {
      intervalId = setInterval(() => {
        if (bootstrap()) {
          if (intervalId) clearInterval(intervalId);
          if (timeoutId) clearTimeout(timeoutId);
          finish(true);
        }
      }, BOOTSTRAP_POLL_MS);

      timeoutId = setTimeout(() => {
        if (intervalId) clearInterval(intervalId);
        finish(false);
      }, BOOTSTRAP_TIMEOUT_MS);
    }

    const unsubScript = onTelegramScriptLoaded(() => {
      if (bootstrap()) {
        if (intervalId) clearInterval(intervalId);
        if (timeoutId) clearTimeout(timeoutId);
        finish(true);
      }
    });

    const onVisible = () => {
      if (bootstrap()) setAuthError(null);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
      unsubScript();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [bootstrap]);

  const canAuthenticate = hasValidTelegramAuth(snapshot);
  const isInsideTelegram =
    snapshot.source === "webapp" ||
    snapshot.source === "url" ||
    snapshot.initData === "dev-mode";

  const value = useMemo(
    () => ({
      initData: snapshot.initData,
      telegramUserId: snapshot.telegramUserId,
      isReady,
      canAuthenticate,
      authError,
      displayName: snapshot.displayName,
      isInsideTelegram,
    }),
    [snapshot, isReady, canAuthenticate, authError]
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
