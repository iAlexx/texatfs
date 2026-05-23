/**
 * Texas HTTP sign-in — Node/undici only.
 *
 * Avoids Next.js patched `globalThis.fetch` (markAsUncloneable errors when
 * mixing dispatcher, cache, or Headers cloning). All requests use undici with
 * plain Record<string, string> headers.
 */
import type { Dispatcher } from "undici";
import {
  buildTexasSignInBody,
  buildTexasSignInUrls,
  CHROME_USER_AGENT,
  extractSetCookieHeaders,
  getTexasSignInErrorMessage,
  humanWarmUpDelayMs,
  isTexasSignInSuccess,
  resolveTexasApiBaseUrl,
  sleep,
  TEXAS_AGENTS_ORIGIN,
  type TexasSignInEnvelope,
} from "@/lib/texas/texas-api-config";
import { getTexasFetchDispatcher } from "@/lib/texas/texas-proxy";
import { texasUndiciFetch } from "@/lib/texas/undici-fetch";

export interface TexasHttpSignInResult {
  ok: boolean;
  setCookies: string[];
  httpStatus: number;
  texasMessage: string;
  bodyPreview: string;
}

/** Minimal cookie jar — string pairs only, no Web APIs. */
class PlainCookieJar {
  private readonly values = new Map<string, string>();
  private readonly setCookieLines: string[] = [];

  absorb(lines: string[]): void {
    for (const line of lines) {
      if (!line) continue;
      this.setCookieLines.push(line);
      const pair = line.split(";")[0]?.trim();
      if (!pair) continue;
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (name) this.values.set(name, value);
    }
  }

  headerValue(): string {
    return Array.from(this.values.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  allSetCookieLines(): string[] {
    return this.setCookieLines.length > 0
      ? [...this.setCookieLines]
      : Array.from(this.values.entries()).map(
          ([name, value]) => `${name}=${value}; Path=/`
        );
  }
}

/** Read Set-Cookie without passing a Headers instance into shared helpers. */
function readSetCookieLines(headers: {
  get: (name: string) => string | null;
  getSetCookie?: () => string[];
}): string[] {
  if (typeof headers.getSetCookie === "function") {
    try {
      const multi = headers.getSetCookie();
      if (multi.length > 0) return multi;
    } catch {
      /* undici / Node version mismatch — fall through */
    }
  }
  const single = headers.get("set-cookie");
  if (!single) return [];
  return extractSetCookieHeaders({ "set-cookie": single });
}

async function plainHttpRequest(
  url: string,
  method: "GET" | "POST",
  headers: Record<string, string>,
  body: string | undefined,
  dispatcher: Dispatcher | undefined
): Promise<{ status: number; bodyText: string; setCookies: string[] }> {
  const response = await texasUndiciFetch(url, {
    method,
    headers,
    body: method === "POST" ? body : undefined,
    redirect: "follow",
    ...(dispatcher ? { dispatcher } : {}),
  });

  const bodyText = await response.text();
  const setCookies = readSetCookieLines(response.headers);

  return { status: response.status, bodyText, setCookies };
}

function parseSignInJson(bodyText: string): TexasSignInEnvelope | null {
  const trimmed = bodyText.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    return JSON.parse(trimmed) as TexasSignInEnvelope;
  } catch {
    return null;
  }
}

/**
 * Landing GET → short delay → POST /User/signIn (HTTP only, undici).
 */
export async function texasHttpSignInWithWarmUp(
  username: string,
  password: string
): Promise<TexasHttpSignInResult> {
  const dispatcher = await getTexasFetchDispatcher();
  const jar = new PlainCookieJar();
  const landingUrl = `${TEXAS_AGENTS_ORIGIN}/`;

  try {
    const landing = await plainHttpRequest(
      landingUrl,
      "GET",
      {
        "User-Agent": CHROME_USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      undefined,
      dispatcher
    );
    jar.absorb(landing.setCookies);

    await sleep(humanWarmUpDelayMs());

    const bodyJson = JSON.stringify(buildTexasSignInBody(username, password));
    const signInUrls = buildTexasSignInUrls(resolveTexasApiBaseUrl());

    let lastStatus = 0;
    let lastBody = "";
    let lastCookies: string[] = [];

    for (const signInUrl of signInUrls) {
      const headers: Record<string, string> = {
        "User-Agent": CHROME_USER_AGENT,
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        Origin: TEXAS_AGENTS_ORIGIN,
        Referer: `${TEXAS_AGENTS_ORIGIN}/`,
      };
      const cookie = jar.headerValue();
      if (cookie) headers.Cookie = cookie;

      const result = await plainHttpRequest(
        signInUrl,
        "POST",
        headers,
        bodyJson,
        dispatcher
      );

      jar.absorb(result.setCookies);
      lastStatus = result.status;
      lastBody = result.bodyText;
      lastCookies = jar.allSetCookieLines();

      const data = parseSignInJson(result.bodyText);
      const texasMessage = getTexasSignInErrorMessage(data, result.status);

      if (
        result.status >= 200 &&
        result.status < 300 &&
        isTexasSignInSuccess(data) &&
        lastCookies.length > 0
      ) {
        return {
          ok: true,
          setCookies: lastCookies,
          httpStatus: result.status,
          texasMessage,
          bodyPreview: result.bodyText.slice(0, 300),
        };
      }

      if (![403, 429, 502, 503, 504].includes(result.status)) {
        return {
          ok: false,
          setCookies: lastCookies,
          httpStatus: result.status,
          texasMessage:
            result.status === 403
              ? "HTTP 403 Forbidden (Cloudflare/WAF)"
              : texasMessage,
          bodyPreview: lastBody.slice(0, 300) || JSON.stringify(data ?? ""),
        };
      }
    }

    const data = parseSignInJson(lastBody);
    return {
      ok: false,
      setCookies: lastCookies,
      httpStatus: lastStatus,
      texasMessage: getTexasSignInErrorMessage(data, lastStatus),
      bodyPreview: lastBody.slice(0, 300),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[texas-http-sign-in] transport error", { message });
    return {
      ok: false,
      setCookies: [],
      httpStatus: 0,
      texasMessage: message,
      bodyPreview: "",
    };
  }
}
