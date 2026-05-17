/**
 * Texas agent dashboard API lives under `/global/api` on agents.texas4win.com
 */
export const TEXAS_AGENTS_ORIGIN = "https://agents.texas4win.com";

export const TEXAS_AGENTS_API_DEFAULT = `${TEXAS_AGENTS_ORIGIN}/global/api`;

export const TEXAS_SIGN_IN_PATH = "/User/signIn";

/** Current Chrome on Windows — frozen for entire warm-up + sign-in flow. */
export const CHROME_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export const TEXAS_SEC_CH_UA =
  '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"';
export const TEXAS_SEC_CH_UA_MOBILE = "?0";
export const TEXAS_SEC_CH_UA_PLATFORM = '"Windows"';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Phase 3: human pause between landing GET and sign-in POST (2–4s). */
export function humanWarmUpDelayMs(): number {
  return 2000 + Math.floor(Math.random() * 2000);
}

/** Random 1–3s delay before retry after 403/429. */
export function texasRetryDelayMs(): number {
  return 1000 + Math.floor(Math.random() * 2000);
}

/** Phase 1 — browser lands on home page (navigation request). */
export function buildTexasLandingHeaders(cookie?: string): [string, string][] {
  const pairs: [string, string][] = [
    ["Host", "agents.texas4win.com"],
    ["Connection", "keep-alive"],
    ["sec-ch-ua", TEXAS_SEC_CH_UA],
    ["sec-ch-ua-mobile", TEXAS_SEC_CH_UA_MOBILE],
    ["sec-ch-ua-platform", TEXAS_SEC_CH_UA_PLATFORM],
    [
      "Accept",
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    ],
    ["User-Agent", CHROME_USER_AGENT],
    ["Upgrade-Insecure-Requests", "1"],
    ["Sec-Fetch-Site", "none"],
    ["Sec-Fetch-Mode", "navigate"],
    ["Sec-Fetch-User", "?1"],
    ["Sec-Fetch-Dest", "document"],
    ["Accept-Encoding", "gzip, deflate, br"],
    ["Accept-Language", "en-US,en;q=0.9"],
  ];
  if (cookie) pairs.push(["Cookie", cookie]);
  return pairs;
}

/** Phase 4 — API POST (same UA / sec-ch-ua as landing). */
export function buildTexasApiPostHeaders(
  host: string,
  contentLength: number,
  cookie?: string
): [string, string][] {
  const pairs: [string, string][] = [
    ["Host", host],
    ["Connection", "keep-alive"],
    ["Content-Length", String(contentLength)],
    ["sec-ch-ua", TEXAS_SEC_CH_UA],
    ["sec-ch-ua-mobile", TEXAS_SEC_CH_UA_MOBILE],
    ["sec-ch-ua-platform", TEXAS_SEC_CH_UA_PLATFORM],
    ["Accept", "application/json, text/plain, */*"],
    ["Content-Type", "application/json"],
    ["User-Agent", CHROME_USER_AGENT],
    ["Origin", TEXAS_AGENTS_ORIGIN],
    ["Referer", `${TEXAS_AGENTS_ORIGIN}/`],
    ["Sec-Fetch-Site", "same-origin"],
    ["Sec-Fetch-Mode", "cors"],
    ["Sec-Fetch-Dest", "empty"],
    ["Accept-Encoding", "gzip, deflate, br"],
    ["Accept-Language", "en-US,en;q=0.9"],
  ];
  if (cookie) pairs.push(["Cookie", cookie]);
  return pairs;
}

export function normalizeTexasApiBaseUrl(raw?: string): string | undefined {
  const input = raw?.trim();
  if (!input) return undefined;

  const trimmed = input.replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }

  const path = url.pathname.replace(/\/$/, "");
  const needsGlobalApi =
    url.hostname === "agents.texas4win.com" && !path.endsWith("/global/api");

  if (needsGlobalApi) {
    url.pathname = "/global/api";
    return `${url.origin}${url.pathname}`;
  }

  return trimmed;
}

export function resolveTexasApiBaseUrl(): string {
  const fromEnv = normalizeTexasApiBaseUrl(
    process.env.TEXAS_API_BASE_URL ?? process.env.NEXT_PUBLIC_TEXAS_API_BASE_URL
  );
  return fromEnv ?? TEXAS_AGENTS_API_DEFAULT;
}

/**
 * Chrome header order (Cloudflare often checks ordering).
 * Passed as [name, value][] to preserve insertion order in undici/fetch.
 */
export function buildOrderedTexasHeaders(options: {
  host: string;
  contentLength: number;
  cookie?: string;
  method?: "GET" | "POST";
}): Headers {
  const pairs: [string, string][] = [
    ["Host", options.host],
    ["Connection", "keep-alive"],
  ];

  if (options.method === "POST") {
    pairs.push(["Content-Length", String(options.contentLength)]);
  }

  pairs.push(
    ["sec-ch-ua", TEXAS_SEC_CH_UA],
    ["sec-ch-ua-mobile", TEXAS_SEC_CH_UA_MOBILE],
    ["sec-ch-ua-platform", TEXAS_SEC_CH_UA_PLATFORM],
    ["Accept", "application/json, text/plain, */*"],
    ["User-Agent", CHROME_USER_AGENT]
  );

  if (options.method === "POST") {
    pairs.push(["Content-Type", "application/json"]);
  }

  pairs.push(
    ["Origin", TEXAS_AGENTS_ORIGIN],
    ["Referer", `${TEXAS_AGENTS_ORIGIN}/`],
    ["Accept-Encoding", "gzip, deflate, br"],
    ["Accept-Language", "en-US,en;q=0.9"],
    ["Sec-Fetch-Site", "same-origin"],
    ["Sec-Fetch-Mode", options.method === "GET" ? "navigate" : "cors"],
    ["Sec-Fetch-Dest", options.method === "GET" ? "document" : "empty"]
  );

  if (options.cookie) {
    pairs.push(["Cookie", options.cookie]);
  }

  return new Headers(pairs);
}

/** Plain object for axios (order not guaranteed — prefer texasBrowserFetch). */
export function buildTexasBrowserHeaders(cookie?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Content-Type": "application/json",
    "User-Agent": CHROME_USER_AGENT,
    Origin: TEXAS_AGENTS_ORIGIN,
    Referer: `${TEXAS_AGENTS_ORIGIN}/`,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "sec-ch-ua": TEXAS_SEC_CH_UA,
    "sec-ch-ua-mobile": TEXAS_SEC_CH_UA_MOBILE,
    "sec-ch-ua-platform": TEXAS_SEC_CH_UA_PLATFORM,
  };
  if (cookie) h.Cookie = cookie;
  return h;
}

export function buildTexasSignInBody(username: string, password: string) {
  return { username, password };
}

export function buildTexasSignInUrls(baseUrl?: string): string[] {
  const base = (baseUrl ?? resolveTexasApiBaseUrl()).replace(/\/$/, "");
  const path = TEXAS_SIGN_IN_PATH.replace(/^\//, "");
  return [`${base}/${path}`, `${base}/${path}/`];
}

export interface TexasSignInEnvelope {
  status?: boolean;
  html?: string;
  result?: { type?: number; message?: string } | boolean;
  notification?: Array<{ content?: string; title?: string; status?: string }>;
}

export function isTexasSignInSuccess(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const result = (data as TexasSignInEnvelope).result;
  return (
    typeof result === "object" &&
    result !== null &&
    "type" in result &&
    result.type === 0
  );
}

export function getTexasSignInErrorMessage(
  data: unknown,
  httpStatus?: number
): string {
  if (httpStatus === 403) {
    return "Blocked by Texas/Cloudflare (HTTP 403)";
  }
  if (httpStatus === 401) {
    return "Unauthorized (HTTP 401)";
  }
  if (!data || typeof data !== "object") {
    if (httpStatus) return `HTTP ${httpStatus} non-JSON response`;
    return "empty or non-JSON response";
  }
  const envelope = data as TexasSignInEnvelope;
  if (envelope.result === false) {
    return (
      envelope.notification?.[0]?.content ?? "Invalid username or password"
    );
  }
  if (
    envelope.result &&
    typeof envelope.result === "object" &&
    envelope.result.message
  ) {
    return envelope.result.message;
  }
  return "unexpected sign-in response shape";
}

export function extractSetCookieHeaders(
  headers: Headers | Record<string, unknown>
): string[] {
  if (headers instanceof Headers) {
    if (typeof headers.getSetCookie === "function") {
      const fromGetSetCookie = headers.getSetCookie();
      if (fromGetSetCookie.length > 0) return fromGetSetCookie;
    }
    const single = headers.get("set-cookie");
    if (single) return splitCombinedSetCookie(single);
    return [];
  }

  const raw = headers["set-cookie"] ?? headers["Set-Cookie"];
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  return splitCombinedSetCookie(String(raw));
}

function splitCombinedSetCookie(value: string): string[] {
  if (!value.includes(",")) return [value];
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] !== ",") continue;
    const rest = value.slice(i + 1);
    const nameMatch = /^\s*([A-Za-z0-9_-]+)=/.exec(rest);
    if (nameMatch) {
      parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

export function normalizeTexasUsername(value: string): string {
  return value.trim();
}

export function normalizeTexasPassword(value: string): string {
  return value;
}

export function logTexasSignInFailure(details: {
  username: string;
  url: string;
  httpStatus: number;
  cookieCount: number;
  texasMessage: string;
  bodyPreview: string;
  attempt?: number;
}): void {
  console.error("[TexasSessionService] signIn failed", {
    username: details.username,
    url: details.url,
    httpStatus: details.httpStatus,
    cookieCount: details.cookieCount,
    texasMessage: details.texasMessage,
    attempt: details.attempt,
    bodyPreview: details.bodyPreview.slice(0, 500),
  });
}
