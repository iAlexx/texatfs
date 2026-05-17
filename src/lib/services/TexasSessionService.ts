import type { AxiosInstance } from "axios";
import { getApiClientFromToken, getTexasApiBaseUrl } from "@/app/utils/api-client";
import {
  findValidTokenOf,
  invalidateToken,
  storeTexasSession,
} from "@/app/utils/token-cache";
import { toToken } from "@/app/utils/token-manager";
import {
  extractSetCookieHeaders,
  TEXAS_API_DEFAULT_HEADERS,
} from "@/lib/texas/texas-api-config";
import type { TexasCredentials } from "@/lib/texas/types";

interface SignInEnvelope {
  status?: boolean;
  result?: {
    type?: number;
    message?: string;
  };
}

/**
 * Authenticates background workers against the Texas agent dashboard.
 *
 * Session model (from signIn route + agents front-end):
 * 1. POST {base}/User/signIn with { username, password } (no auth header).
 * 2. On success (type 0, message "dashboard"), Texas returns Set-Cookie headers.
 * 3. Cookies are serialized via toToken() → Bearer token.
 * 4. Subsequent calls send Cookie header rebuilt from that token.
 */
export class TexasSessionService {
  async signIn(credentials: TexasCredentials): Promise<string> {
    const cached = findValidTokenOf(
      credentials.username,
      credentials.password,
      new Date()
    );
    if (cached) return cached;

    const baseUrl = getTexasApiBaseUrl();
    const url = `${baseUrl.replace(/\/$/, "")}/User/signIn`;

    const response = await fetch(url, {
      method: "POST",
      headers: TEXAS_API_DEFAULT_HEADERS,
      body: JSON.stringify({
        username: credentials.username,
        password: credentials.password,
      }),
      redirect: "follow",
    });

    const setCookie = extractSetCookieHeaders(response.headers);
    const contentType = response.headers.get("content-type") ?? "";
    let data: SignInEnvelope | null = null;
    const rawBody = await response.text();

    if (contentType.includes("application/json") && rawBody.trim()) {
      try {
        data = JSON.parse(rawBody) as SignInEnvelope;
      } catch {
        data = null;
      }
    }

    if (
      response.ok &&
      data?.result?.type === 0 &&
      data?.result?.message === "dashboard" &&
      setCookie.length > 0
    ) {
      return storeTexasSession(
        credentials.username,
        credentials.password,
        setCookie
      );
    }

    const hint =
      response.status === 405 || rawBody.includes("405 Not Allowed")
        ? " — check TEXAS_API_BASE_URL includes /global/api (e.g. https://agents.texas4win.com/global/api)"
        : "";

    throw new Error(
      `Texas sign-in failed for ${credentials.username}: HTTP ${response.status}, ` +
        `message=${data?.result?.message ?? (data ? "invalid envelope" : "non-JSON response")}` +
        hint
    );
  }

  async getClient(credentials: TexasCredentials): Promise<AxiosInstance> {
    const token = await this.signIn(credentials);
    return getApiClientFromToken(token);
  }

  getClientFromToken(token: string): AxiosInstance {
    return getApiClientFromToken(token);
  }

  async refresh(credentials: TexasCredentials): Promise<AxiosInstance> {
    invalidateToken(credentials.username, credentials.password);
    return this.getClient(credentials);
  }

  async getToken(credentials: TexasCredentials): Promise<string> {
    return this.signIn(credentials);
  }

  static tokenFromCookies(setCookieHeaders: string[]): string {
    return toToken(setCookieHeaders);
  }
}
