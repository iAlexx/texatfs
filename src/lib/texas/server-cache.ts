/**
 * Module-level TTL cache for Texas API responses.
 * Works on Railway (persistent Node.js server) — shared across all requests.
 * NOT shared across Railway replicas (acceptable: each replica self-fills from Texas API).
 */

interface Entry<T> {
  data: T;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();

// Prune expired entries every 10 minutes to avoid unbounded memory growth
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

export function serverCacheGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function serverCacheSet<T>(key: string, data: T, ttlMs: number): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
  schedulePrune();
}

export function serverCacheDel(key: string): void {
  store.delete(key);
}

export function serverCacheSize(): number {
  return store.size;
}
