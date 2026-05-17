/**
 * Browser-mimicking HTTP for Texas agent API with full session warm-up flow.
 */
import { fetch as undiciFetch } from "undici";
import {
  buildTexasApiPostHeaders,
  buildTexasLandingHeaders,
  extractSetCookieHeaders,
  humanWarmUpDelayMs,
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

/** Cookie jar — stores full Set-Cookie lines + parsed Cookie header value. */
export class TexasCookieJar {
  private readonly store = new Map<string, string>();
  private readonly setCookieLines: string[] = [];

  absorb(setCookieLines: string[]): void {
    for (const line of setCookieLines) {
      if (!line) continue;
      this.setCookieLines.push(line);
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

  allSetCookieLines(): string[] {
    return this.setCookieLines.length > 0
      ? [...this.setCookieLines]
      : Array.from(this.store.entries()).map(
          ([name, value]) => `${name}=${value}; Path=/`
        );
  }

  mergeInto(existing?: string): string {
    if (existing) {
      for (const part of existing.split(";")) {
        const trimmed = part.trim();
        if (trimmed) this.absorb([trimmed]);
      }
    }
    return this.headerValue();
  }

  clear(): void {
    this.store.clear();
    this.setCookieLines.length = 0;
  }
}

export interface TexasBrowserFetchResult {
  status: number;
  headers: Headers;
  bodyText: string;
  setCookies: string[];
}

async function texasRawFetch(
  url: string,
  method: "GET" | "POST",
  headerPairs: [string, string][],
  body?: string
): Promise<TexasBrowserFetchResult> {
  await throttleTexasRequests();

  const dispatcher = getTexasFetchDispatcher();
  const fetchImpl = dispatcher ? undiciFetch : globalThis.fetch.bind(globalThis);

  const response = await fetchImpl(url, {
    method,
    headers: headerPairs,
    body: method === "POST" ? body : undefined,
    redirect: "follow",
    ...(dispatcher ? { dispatcher } : { cache: "no-store" }),
  });

  const bodyText = await response.text();
  const setCookies = extractSetCookieHeaders(response.headers);

  return {
    status: response.status,
    headers: response.headers,
    bodyText,
    setCookies,
  };
}

export interface TexasWarmUpResult {
  landingStatus: number;
  cookieCount: number;
  cookieNames: string[];
}

/**
 * Phases 1–3: GET landing page → capture cookies → human delay (2–4s).
 * Uses identical User-Agent / sec-ch-ua for the whole session.
 */
export async function runTexasPortalWarmUp(
  jar: TexasCookieJar
): Promise<TexasWarmUpResult> {
  const landingUrl = `${TEXAS_AGENTS_ORIGIN}/`;
  logProxyCheck(landingUrl);

  console.info("[texas-warmup] Phase 1 — GET landing page", { url: landingUrl });

  const landing = await texasRawFetch(
    landingUrl,
    "GET",
    buildTexasLandingHeaders(jar.headerValue() || undefined)
  );

  jar.absorb(landing.setCookies);

  const cookieNames = Array.from(
    new Set(
      jar
        .allSetCookieLines()
        .map((line) => line.split("=")[0]?.trim())
        .filter(Boolean) as string[]
    )
  );

  console.info("[texas-warmup] Phase 2 — cookies captured", {
    httpStatus: landing.status,
    cookieCount: jar.allSetCookieLines().length,
    cookieNames,
  });

  const delayMs = humanWarmUpDelayMs();
  console.info("[texas-warmup] Phase 3 — human delay before sign-in", {
    delayMs,
  });
  await sleep(delayMs);

  return {
    landingStatus: landing.status,
    cookieCount: jar.allSetCookieLines().length,
    cookieNames,
  };
}

export interface TexasSignInFlowOptions {
  signInUrls: string[];
  body: string;
  jar?: TexasCookieJar;
}

/**
 * Full Cloudflare session flow: landing → wait → sign-in POST (same fingerprint).
 */
export async function texasSignInWithWarmUp(
  options: TexasSignInFlowOptions
): Promise<TexasBrowserFetchResult & { jar: TexasCookieJar }> {
  const jar = options.jar ?? new TexasCookieJar();

  let lastResult: TexasBrowserFetchResult | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      const delay = texasRetryDelayMs();
      console.warn("[texas-warmup] retrying full session flow", {
        attempt,
        delayMs: delay,
      });
      await sleep(delay);
      jar.clear();
    }

    await runTexasPortalWarmUp(jar);

    for (const signInUrl of options.signInUrls) {
      logProxyCheck(signInUrl);
      console.info("[texas-warmup] Phase 4 — POST signIn", {
        url: signInUrl,
        cookies: jar.headerValue() ? "yes" : "no",
      });

      const parsed = new URL(signInUrl);
      const headerPairs = buildTexasApiPostHeaders(
        parsed.host,
        Buffer.byteLength(options.body, "utf8"),
        jar.headerValue() || undefined
      );

      const result = await texasRawFetch(
        signInUrl,
        "POST",
        headerPairs,
        options.body
      );

      jar.absorb(result.setCookies);
      lastResult = result;

      if (!RETRYABLE_STATUS.has(result.status)) {
        return { ...result, jar };
      }

      console.warn("[texas-warmup] signIn blocked", {
        attempt,
        httpStatus: result.status,
        url: signInUrl,
        isCloudflare: result.bodyText.includes("Cloudflare"),
      });
    }
  }

  return { ...lastResult!, jar };
}

export interface TexasBrowserFetchOptions {
  url: string;
  method?: "GET" | "POST";
  body?: string;
  jar?: TexasCookieJar;
  cookieHeader?: string;
  /** Skip landing warm-up (only for follow-up API calls that already have session cookies). */
  skipWarmUp?: boolean;
}

/** Generic fetch — uses API POST headers; optional warm-up for POST without session. */
export async function texasBrowserFetch(
  options: TexasBrowserFetchOptions
): Promise<TexasBrowserFetchResult> {
  const method = options.method ?? "GET";
  const jar = options.jar ?? new TexasCookieJar();

  if (!options.skipWarmUp && method === "POST") {
    await runTexasPortalWarmUp(jar);
  }

  const parsed = new URL(options.url);
  const cookie =
    jar.mergeInto(options.cookieHeader) || options.cookieHeader || undefined;

  const headerPairs =
    method === "GET"
      ? buildTexasLandingHeaders(cookie)
      : buildTexasApiPostHeaders(
          parsed.host,
          options.body ? Buffer.byteLength(options.body, "utf8") : 0,
          cookie
        );

  if (method === "POST") logProxyCheck(options.url);

  return texasRawFetch(
    options.url,
    method,
    headerPairs,
    method === "POST" ? options.body : undefined
  );
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
