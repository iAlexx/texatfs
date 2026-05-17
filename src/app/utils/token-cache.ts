import { toToken } from "@/app/utils/token-manager";

interface CacheEntry {
  token: string;
  expiresAt: number;
}

const TTL_MS = 55 * 60 * 1000;
const tokenStore = new Map<string, CacheEntry>();

function cacheKey(username: string, password: string): string {
  return `${username}::${password}`;
}

export function storeTexasSession(
  username: string,
  password: string,
  setCookieHeaders: string[]
): string {
  const token = toToken(setCookieHeaders);
  tokenStore.set(cacheKey(username, password), {
    token,
    expiresAt: Date.now() + TTL_MS,
  });
  return token;
}

export function findValidTokenOf(
  username: string,
  password: string,
  now: Date
): string | null {
  const entry = tokenStore.get(cacheKey(username, password));
  if (!entry) return null;
  if (entry.expiresAt <= now.getTime()) {
    tokenStore.delete(cacheKey(username, password));
    return null;
  }
  return entry.token;
}

export function invalidateToken(username: string, password: string): void {
  tokenStore.delete(cacheKey(username, password));
}

/** @deprecated Use storeTexasSession — alias for signIn route compatibility */
export const cache = storeTexasSession;
