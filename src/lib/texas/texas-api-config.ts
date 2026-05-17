/**
 * Texas agent dashboard API lives under `/global/api` on agents.texas4win.com
 * (see affiliates-front-end bundle: `const apiRoot = "/global/api/"`).
 */
export const TEXAS_AGENTS_API_DEFAULT =
  "https://agents.texas4win.com/global/api";

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

export const TEXAS_API_DEFAULT_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  Accept: "application/json, text/plain, */*",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Origin: "https://agents.texas4win.com",
  Referer: "https://agents.texas4win.com/",
};

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

/** Split combined Set-Cookie when only one header line is available. */
function splitCombinedSetCookie(value: string): string[] {
  if (!value.includes(",")) return [value];
  // Expires= contains commas — split only on cookie name boundaries
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
  return value.trim();
}
