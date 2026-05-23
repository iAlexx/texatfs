/**
 * Texas portal HTTP client — undici only, no Next.js fetch / axios.
 *
 * Next.js patches global fetch and axios may route through it in App Router,
 * triggering `util.markAsUncloneable is not a function`. All Texas data calls
 * must use this client.
 */
import type { Dispatcher } from "undici";
import {
  CHROME_USER_AGENT,
  resolveTexasApiBaseUrl,
  TEXAS_AGENTS_ORIGIN,
} from "@/lib/texas/texas-api-config";
import { getTexasFetchDispatcher } from "@/lib/texas/texas-proxy";
import { texasUndiciFetch } from "@/lib/texas/undici-fetch";

/** Axios-compatible response envelope (data + status only). */
export interface TexasHttpResponse<T = unknown> {
  data: T;
  status: number;
}

export interface TexasHttpClient {
  post<T = unknown>(
    path: string,
    body?: unknown
  ): Promise<TexasHttpResponse<T>>;
}

export class TexasHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseData?: unknown
  ) {
    super(message);
    this.name = "TexasHttpError";
  }
}

/** Strip prototypes / non-JSON values before TMA serialization. */
export function toTexasPlainObject<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

let dispatcherPromise: Promise<Dispatcher | undefined> | undefined;

async function getDispatcher(): Promise<Dispatcher | undefined> {
  dispatcherPromise ??= getTexasFetchDispatcher();
  return dispatcherPromise;
}

function resolveTexasUrl(baseUrl: string, path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = baseUrl.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function parseTexasJsonBody<T>(rawText: string, status: number): T {
  const trimmed = rawText.trim();
  if (!trimmed) return {} as T;
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    throw new TexasHttpError(
      `Texas API returned non-JSON (HTTP ${status}): ${trimmed.slice(0, 160)}`,
      status
    );
  }
  try {
    return toTexasPlainObject(JSON.parse(trimmed) as T);
  } catch {
    throw new TexasHttpError(
      `Texas API returned invalid JSON (HTTP ${status})`,
      status
    );
  }
}

/**
 * Build a session-authenticated Texas API client (cookie header from sign-in token).
 */
export function createTexasHttpClient(cookieHeader: string): TexasHttpClient {
  const baseUrl = resolveTexasApiBaseUrl();

  return {
    async post<T>(
      path: string,
      body?: unknown
    ): Promise<TexasHttpResponse<T>> {
      const dispatcher = await getDispatcher();
      const url = resolveTexasUrl(baseUrl, path);
      const payload =
        body === undefined || body === null ? "{}" : JSON.stringify(body);

      const headers: Record<string, string> = {
        "User-Agent": CHROME_USER_AGENT,
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        Origin: TEXAS_AGENTS_ORIGIN,
        Referer: `${TEXAS_AGENTS_ORIGIN}/`,
      };
      if (cookieHeader) headers.Cookie = cookieHeader;

      let response: Awaited<ReturnType<typeof texasUndiciFetch>>;
      try {
        response = await texasUndiciFetch(url, {
          method: "POST",
          headers,
          body: payload,
          redirect: "follow",
          ...(dispatcher ? { dispatcher } : {}),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TexasHttpError(`Texas transport error: ${msg}`, 0);
      }

      const rawText = await response.text();
      const data = parseTexasJsonBody<T>(rawText, response.status);

      if (response.status < 200 || response.status >= 300) {
        throw new TexasHttpError(
          `Texas API HTTP ${response.status}`,
          response.status,
          data
        );
      }

      return { data, status: response.status };
    },
  };
}

/**
 * Wraps a client with one automatic re-auth retry on HTTP 401.
 */
export function wrapTexasHttpClientWithRefresh(
  client: TexasHttpClient,
  onUnauthorized: () => Promise<TexasHttpClient>
): TexasHttpClient {
  return {
    async post<T>(path: string, body?: unknown): Promise<TexasHttpResponse<T>> {
      try {
        return await client.post<T>(path, body);
      } catch (err) {
        if (err instanceof TexasHttpError && err.status === 401) {
          const refreshed = await onUnauthorized();
          return refreshed.post<T>(path, body);
        }
        throw err;
      }
    },
  };
}
