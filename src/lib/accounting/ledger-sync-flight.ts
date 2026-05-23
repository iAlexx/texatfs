/**
 * Coalesce concurrent ledger syncs for the same user + business date.
 * Prevents duplicate Texas snapshot application and race writes to daily_ledgers.
 */
const inflight = new Map<string, Promise<unknown>>();

export function ledgerSyncKey(userId: string, ledgerDate: string): string {
  return `${userId}::${ledgerDate}`;
}

export function coalesceLedgerSync<T>(
  userId: string,
  ledgerDate: string,
  run: () => Promise<T>
): Promise<T> {
  const key = ledgerSyncKey(userId, ledgerDate);
  const existing = inflight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = run().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}
