"use client";

/**
 * @deprecated Use `useLedgerSession` from `@/hooks/use-ledger-api` instead.
 */
import { useLedgerSession, todayIsoDate } from "@/hooks/use-ledger-api";

export function useDailyLedgerRealtime(ledgerDate?: string) {
  const date = ledgerDate ?? todayIsoDate();
  const session = useLedgerSession(date);

  return {
    data: session.data,
    loading: session.isLoading,
    error: session.error,
    subscriptionExpired: session.subscriptionExpired,
    refresh: session.refresh,
  };
}
