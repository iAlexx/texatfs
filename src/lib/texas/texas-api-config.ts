/**
 * Texas agent dashboard API lives under `/global/api` on agents.texas4win.com
 * (see affiliates-front-end bundle: `const apiRoot = "/global/api/"`).
 */
export function normalizeTexasApiBaseUrl(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;

  const trimmed = raw.trim().replace(/\/+$/, "");
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

export const TEXAS_API_DEFAULT_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  Accept: "application/json, text/plain, */*",
  "User-Agent": "TexasFundsCalculate/1.0",
};

/** Read Set-Cookie reliably in Node 18+ (axios merges multiple cookies incorrectly). */
export function extractSetCookieHeaders(headers: Headers): string[] {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}
