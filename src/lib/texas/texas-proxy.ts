import { HttpsProxyAgent } from "https-proxy-agent";
import { ProxyAgent, type Dispatcher } from "undici";

let cachedProxyUrl: string | undefined;
let cachedHttpsAgent: HttpsProxyAgent<string> | undefined;
let cachedFetchDispatcher: Dispatcher | undefined;

/**
 * Premium residential proxy for Texas API (bypasses Cloudflare on Vercel/datacenter IPs).
 * Set TEXAS_HTTP_PROXY=http://username:password@host:port
 */
export function resolveTexasProxyUrl(): string | undefined {
  const raw = process.env.TEXAS_HTTP_PROXY?.trim();
  if (!raw) return undefined;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `http://${raw}`;
}

function ensureProxyAgents(url: string): void {
  if (cachedProxyUrl === url && cachedHttpsAgent && cachedFetchDispatcher) return;
  cachedProxyUrl = url;
  cachedHttpsAgent = new HttpsProxyAgent(url);
  cachedFetchDispatcher = new ProxyAgent(url);
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

export function isTexasProxyEnabled(): boolean {
  return Boolean(resolveTexasProxyUrl());
}

let lastProxyLogAt = 0;

/** Confirm Texas traffic is routed through TEXAS_HTTP_PROXY (throttled per flow). */
export function logProxyCheck(targetUrl: string): void {
  if (!isTexasProxyEnabled()) return;
  const now = Date.now();
  if (now - lastProxyLogAt < 3000) return;
  lastProxyLogAt = now;
  console.info("[Proxy-Check] Routing request through Verizon 5G Proxy...", {
    target: targetUrl,
    via: getTexasProxyLogLabel(),
  });
}

/** For axios — https-proxy-agent */
export function getTexasHttpsProxyAgent(): HttpsProxyAgent<string> | undefined {
  const url = resolveTexasProxyUrl();
  if (!url) {
    cachedProxyUrl = undefined;
    cachedHttpsAgent = undefined;
    cachedFetchDispatcher = undefined;
    return undefined;
  }
  ensureProxyAgents(url);
  return cachedHttpsAgent;
}

/** For undici fetch — ProxyAgent (same TEXAS_HTTP_PROXY URL). */
export function getTexasFetchDispatcher(): Dispatcher | undefined {
  const url = resolveTexasProxyUrl();
  if (!url) return undefined;
  ensureProxyAgents(url);
  return cachedFetchDispatcher;
}
