import type { AxiosInstance } from "axios";
import { api, getApiClientFromToken } from "@/app/utils/api-client";
import {
  findValidTokenOf,
  invalidateToken,
  storeTexasSession,
} from "@/app/utils/token-cache";
import { toToken } from "@/app/utils/token-manager";
import type { TexasCredentials } from "@/lib/texas/types";

interface SignInResult {
  type: number;
  message: string;
}

/**
 * Authenticates background workers against the Texas dashboard.
 *
 * Session model (from signIn route):
 * 1. POST /User/signIn with username/password (no auth header).
 * 2. On success, Texas returns Set-Cookie headers.
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

    const response = await api.post<{ result: SignInResult }>("/User/signIn", {
      username: credentials.username,
      password: credentials.password,
    });

    const setCookie = response.headers["set-cookie"];
    if (
      response.data?.result?.type === 0 &&
      response.data?.result?.message === "dashboard" &&
      Array.isArray(setCookie) &&
      setCookie.length > 0
    ) {
      return storeTexasSession(
        credentials.username,
        credentials.password,
        setCookie
      );
    }

    throw new Error(
      `Texas sign-in failed for ${credentials.username}: ${response.data?.result?.message ?? "unknown"}`
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

  /** Expose token for storage in secure vault / DB if needed by cron runners */
  async getToken(credentials: TexasCredentials): Promise<string> {
    return this.signIn(credentials);
  }

  static tokenFromCookies(setCookieHeaders: string[]): string {
    return toToken(setCookieHeaders);
  }
}
