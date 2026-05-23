/**
 * Module-level TTL cache for Texas API responses.
 * Every entry is bound to a single ownerUserId — cross-user reads are rejected.
 */

interface Entry<T> {
  data: T;
  ownerUserId: string;
  expiresAt: number;
  createdAt: number;
}

const store = new Map<string, Entry<unknown>>();

const PRUNE_INTERVAL_MS = 10 * 60_000;
let pruneTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePrune() {
  if (pruneTimer) return;
  pruneTimer = setTimeout(() => {
    pruneTimer = null;
    const now = Date.now();
    for (const [k, v] of store) {
      if (now > v.expiresAt) store.delete(k);
    }
    if (store.size > 0) schedulePrune();
  }, PRUNE_INTERVAL_MS);
}

export function serverCacheGet<T>(
  key: string,
  ownerUserId: string
): T | null {
  const entry = store.get(key);
  const now = Date.now();
  if (!entry) {
    console.info("[server-cache] MISS", { key, ownerUserId });
    return null;
  }
  if (entry.ownerUserId !== ownerUserId) {
    console.error("[server-cache] USER CONTEXT VIOLATION — owner mismatch", {
      key,
      requestedBy: ownerUserId,
      cacheOwner: entry.ownerUserId,
    });
    store.delete(key);
    return null;
  }
  if (now > entry.expiresAt) {
    store.delete(key);
    console.info("[server-cache] EXPIRED", { key, ageMs: now - entry.createdAt });
    return null;
  }
  console.info("[server-cache] HIT", {
    key,
    ownerUserId,
    ageMs: now - entry.createdAt,
  });
  return entry.data as T;
}

export function serverCacheSet<T>(
  key: string,
  ownerUserId: string,
  data: T,
  ttlMs: number
): void {
  store.set(key, {
    data,
    ownerUserId,
    expiresAt: Date.now() + ttlMs,
    createdAt: Date.now(),
  });
  schedulePrune();
}

export function serverCacheDel(key: string): void {
  store.delete(key);
}

export function serverCacheSize(): number {
  return store.size;
}
