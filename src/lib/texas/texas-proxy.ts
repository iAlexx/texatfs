import { HttpsProxyAgent } from "https-proxy-agent";
import { ProxyAgent, type Dispatcher } from "undici";

let cachedHttpsAgent: HttpsProxyAgent<string> | undefined;
let cachedFetchDispatcher: Dispatcher | undefined;

/**
 * Residential/datacenter proxy for Texas API (bypasses Cloudflare on Vercel IPs).
 * Format: http://username:password@host:port
 */
export function resolveTexasProxyUrl(): string | undefined {
  const raw = process.env.TEXAS_HTTP_PROXY?.trim();
  if (!raw) return undefined;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `http://${raw}`;
}

export function getTexasProxyLogLabel(): string | null {
  const url = resolveTexasProxyUrl();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || "80"}`;
  } catch {
    return "configured";
  }
}

/** For axios — https-proxy-agent */
export function getTexasHttpsProxyAgent(): HttpsProxyAgent<string> | undefined {
  const url = resolveTexasProxyUrl();
  if (!url) return undefined;
  if (!cachedHttpsAgent) {
    cachedHttpsAgent = new HttpsProxyAgent(url);
  }
  return cachedHttpsAgent;
}

/** For native fetch — undici ProxyAgent (same TEXAS_HTTP_PROXY URL). */
export function getTexasFetchDispatcher(): Dispatcher | undefined {
  const url = resolveTexasProxyUrl();
  if (!url) return undefined;
  if (!cachedFetchDispatcher) {
    cachedFetchDispatcher = new ProxyAgent(url);
  }
  return cachedFetchDispatcher;
}

export function isTexasProxyEnabled(): boolean {
  return Boolean(resolveTexasProxyUrl());
}
