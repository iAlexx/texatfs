/**
 * Texas agent dashboard API lives under `/global/api` on agents.texas4win.com
 * (see affiliates-front-end bundle: `const apiRoot = "/global/api/"`).
 */
export const TEXAS_AGENTS_API_DEFAULT =
  "https://agents.texas4win.com/global/api";

export const TEXAS_SIGN_IN_PATH = "/User/signIn";

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

/** Browser-like headers for Texas agent portal (Cloudflare/WAF-friendly). */
export function buildTexasBrowserHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Origin: "https://agents.texas4win.com",
    Referer: "https://agents.texas4win.com/",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
  };
}

/** @deprecated use buildTexasBrowserHeaders */
export const TEXAS_API_DEFAULT_HEADERS = buildTexasBrowserHeaders();

/** Texas sign-in body — confirmed from portal proxy: { username, password }. */
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

/** Success when result is an object with type === 0 (not boolean `false`). */
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

export function getTexasSignInErrorMessage(data: unknown): string {
  if (!data || typeof data !== "object") return "empty or non-JSON response";
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

/** Read Set-Cookie from fetch Headers or axios-style header objects. */
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

/** Trim login only — passwords may contain intentional leading/trailing spaces. */
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
}): void {
  console.error("[TexasSessionService] signIn failed", {
    username: details.username,
    url: details.url,
    httpStatus: details.httpStatus,
    cookieCount: details.cookieCount,
    texasMessage: details.texasMessage,
    bodyPreview: details.bodyPreview.slice(0, 500),
  });
}
