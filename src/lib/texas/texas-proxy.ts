import { HttpsProxyAgent } from "https-proxy-agent";
import type { Dispatcher } from "undici";

let cachedProxyUrl: string | undefined;
let cachedHttpsAgent: HttpsProxyAgent<string> | undefined;
let cachedFetchDispatcher: Dispatcher | undefined;
let fetchDispatcherPromise: Promise<Dispatcher | undefined> | undefined;

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

function ensureHttpsAgent(url: string): HttpsProxyAgent<string> {
  if (cachedProxyUrl === url && cachedHttpsAgent) return cachedHttpsAgent;
  cachedProxyUrl = url;
  cachedHttpsAgent = new HttpsProxyAgent(url);
  cachedFetchDispatcher = undefined;
  fetchDispatcherPromise = undefined;
  return cachedHttpsAgent;
}

/** Lazy-load undici ProxyAgent (avoids bundling undici into Next.js route chunks). */
async function ensureFetchDispatcher(url: string): Promise<Dispatcher> {
  if (cachedProxyUrl === url && cachedFetchDispatcher) {
    return cachedFetchDispatcher;
  }
  if (!fetchDispatcherPromise || cachedProxyUrl !== url) {
    fetchDispatcherPromise = (async () => {
      const { ProxyAgent } = await import("undici");
      cachedProxyUrl = url;
      cachedFetchDispatcher = new ProxyAgent(url);
      return cachedFetchDispatcher;
    })();
  }
  const dispatcher = await fetchDispatcherPromise;
  if (!dispatcher) throw new Error("Failed to initialize proxy dispatcher");
  return dispatcher;
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

/** Puppeteer `--proxy-server` arg (credentials applied via page.authenticate). */
export function getTexasProxyLaunchArgs(): string[] {
  const url = resolveTexasProxyUrl();
  if (!url) return [];
  try {
    const parsed = new URL(url);
    const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    return [`--proxy-server=${parsed.protocol}//${parsed.hostname}:${port}`];
  } catch {
    return [];
  }
}

export function getTexasProxyAuth():
  | { username: string; password: string }
  | undefined {
  const url = resolveTexasProxyUrl();
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (!parsed.username) return undefined;
    return {
      username: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
    };
  } catch {
    return undefined;
  }
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
    fetchDispatcherPromise = undefined;
    return undefined;
  }
  return ensureHttpsAgent(url);
}

/** For undici fetch — ProxyAgent (lazy import). */
export async function getTexasFetchDispatcher(): Promise<Dispatcher | undefined> {
  const url = resolveTexasProxyUrl();
  if (!url) return undefined;
  return ensureFetchDispatcher(url);
}
