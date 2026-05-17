/**
 * Browser-mimicking HTTP for Texas agent API (Cloudflare / WAF bypass attempts).
 * Uses undici fetch when a proxy is configured, otherwise global fetch.
 */
import { fetch as undiciFetch } from "undici";
import {
  buildOrderedTexasHeaders,
  extractSetCookieHeaders,
  sleep,
  texasRetryDelayMs,
  TEXAS_AGENTS_ORIGIN,
} from "@/lib/texas/texas-api-config";
import {
  getTexasFetchDispatcher,
  logProxyCheck,
} from "@/lib/texas/texas-proxy";

const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS = new Set([403, 429, 502, 503, 504]);

let lastTexasRequestAt = 0;
const MIN_GAP_MS = 400;

async function throttleTexasRequests(): Promise<void> {
  const now = Date.now();
  const wait = MIN_GAP_MS - (now - lastTexasRequestAt);
  if (wait > 0) await sleep(wait);
  lastTexasRequestAt = Date.now();
}

/** In-memory cookie jar for warm-up + sign-in redirect chains. */
export class TexasCookieJar {
  private readonly store = new Map<string, string>();

  absorb(setCookieLines: string[]): void {
    for (const line of setCookieLines) {
      const pair = line.split(";")[0]?.trim();
      if (!pair) continue;
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (name) this.store.set(name, value);
    }
  }

  headerValue(): string {
    return Array.from(this.store.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  /** Fallback when fetch does not expose getSetCookie() for all cookies. */
  toSetCookieLines(): string[] {
    return Array.from(this.store.entries()).map(
      ([name, value]) => `${name}=${value}; Path=/`
    );
  }

  mergeInto(existing?: string): string {
    if (existing) this.absorb(existing.split(";").map((p) => p.trim()));
    return this.headerValue();
  }
}

export interface TexasBrowserFetchResult {
  status: number;
  headers: Headers;
  bodyText: string;
  setCookies: string[];
}

/**
 * GET agents portal root to obtain Cloudflare / session cookies before API POST.
 */
export async function warmUpTexasPortal(jar: TexasCookieJar): Promise<void> {
  await texasBrowserFetch({
    url: `${TEXAS_AGENTS_ORIGIN}/`,
    method: "GET",
    jar,
    skipWarmUp: true,
  });
}

export interface TexasBrowserFetchOptions {
  url: string;
  method?: "GET" | "POST";
  body?: string;
  jar?: TexasCookieJar;
  /** Extra Cookie header merged with jar */
  cookieHeader?: string;
  skipWarmUp?: boolean;
}

/**
 * Fetch with Chrome-ordered headers, redirect follow, and 403 retry + jitter.
 */
export async function texasBrowserFetch(
  options: TexasBrowserFetchOptions
): Promise<TexasBrowserFetchResult> {
  const method = options.method ?? "GET";
  const body = options.body;
  const jar = options.jar ?? new TexasCookieJar();

  // Portal warm-up often triggers extra Cloudflare checks via proxy; skip when proxied.
  if (!options.skipWarmUp && method === "POST" && !getTexasFetchDispatcher()) {
    try {
      await warmUpTexasPortal(jar);
      await sleep(200 + Math.floor(Math.random() * 300));
    } catch (e) {
      console.warn("[texas-browser-fetch] portal warm-up failed", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const parsed = new URL(options.url);
  const cookie =
    jar.mergeInto(options.cookieHeader) || options.cookieHeader || undefined;

  let lastResult: TexasBrowserFetchResult | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await throttleTexasRequests();

    if (attempt > 1 && lastResult && RETRYABLE_STATUS.has(lastResult.status)) {
      const delay = texasRetryDelayMs();
      console.warn("[texas-browser-fetch] retry after block", {
        attempt,
        status: lastResult.status,
        delayMs: delay,
        url: options.url,
      });
      await sleep(delay);
    }

    const headerPairs: [string, string][] = [];
    const built = buildOrderedTexasHeaders({
      host: parsed.host,
      contentLength: body ? Buffer.byteLength(body, "utf8") : 0,
      cookie,
      method,
    });
    built.forEach((value, key) => headerPairs.push([key, value]));

    const dispatcher = getTexasFetchDispatcher();
    if (attempt === 1 && dispatcher) {
      logProxyCheck(options.url);
    }

    const fetchImpl = dispatcher ? undiciFetch : globalThis.fetch.bind(globalThis);
    const response = await fetchImpl(options.url, {
      method,
      headers: headerPairs,
      body: method === "POST" ? body : undefined,
      redirect: "follow",
      ...(dispatcher ? { dispatcher } : { cache: "no-store" }),
    });

    const bodyText = await response.text();
    const setCookies = extractSetCookieHeaders(response.headers);
    jar.absorb(setCookies);

    lastResult = {
      status: response.status,
      headers: response.headers,
      bodyText,
      setCookies,
    };

    if (!RETRYABLE_STATUS.has(response.status) || attempt === MAX_ATTEMPTS) {
      return lastResult;
    }
  }

  return lastResult!;
}

export function parseTexasJsonBody<T>(bodyText: string): T | null {
  const trimmed = bodyText.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return null;
  }
}
