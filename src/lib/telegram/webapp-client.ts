/** Client-side helpers for Telegram Mini App auth (browser only). */

export interface TelegramAuthSnapshot {
  initData: string;
  telegramUserId: number | null;
  displayName: string;
  source: "webapp" | "url" | "dev" | "none";
}

const SCRIPT_LOADED_EVENT = "telegram-web-app-script-loaded";

/** Call from root layout Script onLoad so the provider can re-bootstrap. */
export function notifyTelegramScriptLoaded(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SCRIPT_LOADED_EVENT));
  }
}

export function onTelegramScriptLoaded(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(SCRIPT_LOADED_EVENT, listener);
  return () => window.removeEventListener(SCRIPT_LOADED_EVENT, listener);
}

/**
 * Some Telegram clients pass launch data in the URL hash before WebApp.initData is set.
 */
export function initDataFromLocation(): string {
  if (typeof window === "undefined") return "";

  const hash = window.location.hash.replace(/^#/, "");
  if (hash.startsWith("tgWebAppData=")) {
    return decodeURIComponent(hash.slice("tgWebAppData=".length));
  }

  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("tgWebAppData");
  if (fromQuery) return fromQuery;

  return "";
}

export function readTelegramAuth(): TelegramAuthSnapshot {
  const devId = process.env.NEXT_PUBLIC_DEV_TELEGRAM_ID;
  const wa = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;

  if (wa) {
    wa.ready();
    wa.expand?.();

    const initData = (wa.initData?.trim() || initDataFromLocation()).trim();
    const user = wa.initDataUnsafe?.user;
    const telegramUserId = user?.id ?? null;
    const displayName = user
      ? [user.first_name, user.last_name].filter(Boolean).join(" ") || "TEXAS FUNDS"
      : "TEXAS FUNDS";

    if (initData) {
      return {
        initData,
        telegramUserId,
        displayName,
        source: initData === wa.initData ? "webapp" : "url",
      };
    }

    if (telegramUserId) {
      return {
        initData: "",
        telegramUserId,
        displayName,
        source: "webapp",
      };
    }
  }

  const urlInitData = initDataFromLocation();
  if (urlInitData) {
    return {
      initData: urlInitData,
      telegramUserId: null,
      displayName: "TEXAS FUNDS",
      source: "url",
    };
  }

  if (devId && process.env.NODE_ENV === "development") {
    return {
      initData: "dev-mode",
      telegramUserId: Number(devId),
      displayName: "TEXAS FUNDS",
      source: "dev",
    };
  }

  return {
    initData: "",
    telegramUserId: null,
    displayName: "TEXAS FUNDS",
    source: "none",
  };
}

export function hasValidTelegramAuth(snapshot: TelegramAuthSnapshot): boolean {
  if (snapshot.initData === "dev-mode") return true;
  return snapshot.initData.length > 0;
}
