import axios from "axios";
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
  normalizeTexasPassword,
  normalizeTexasUsername,
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

function isDashboardSignIn(data: SignInEnvelope | null): boolean {
  return data?.result?.type === 0 && data?.result?.message === "dashboard";
}

/**
 * Authenticates against the Texas agent dashboard.
 *
 * Uses axios for sign-in (reliable `set-cookie` array in Node) with fetch fallback.
 */
export class TexasSessionService {
  async signIn(credentials: TexasCredentials): Promise<string> {
    const username = normalizeTexasUsername(credentials.username);
    const password = normalizeTexasPassword(credentials.password);

    const cached = findValidTokenOf(username, password, new Date());
    if (cached) return cached;

    const baseUrl = getTexasApiBaseUrl();
    const url = `${baseUrl.replace(/\/$/, "")}/User/signIn`;
    const body = { username, password };

    let lastError = "unknown";

    try {
      const axiosRes = await axios.post<SignInEnvelope>(url, body, {
        headers: TEXAS_API_DEFAULT_HEADERS,
        validateStatus: () => true,
        maxRedirects: 5,
      });

      const setCookie = extractSetCookieHeaders(
        axiosRes.headers as Record<string, unknown>
      );
      const data = axiosRes.data;

      if (
        axiosRes.status >= 200 &&
        axiosRes.status < 300 &&
        isDashboardSignIn(data) &&
        setCookie.length > 0
      ) {
        return storeTexasSession(username, password, setCookie);
      }

      lastError = `axios HTTP ${axiosRes.status}, message=${data?.result?.message ?? "no result"}`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: TEXAS_API_DEFAULT_HEADERS,
        body: JSON.stringify(body),
        redirect: "follow",
      });

      const setCookie = extractSetCookieHeaders(response.headers);
      const contentType = response.headers.get("content-type") ?? "";
      const rawBody = await response.text();

      let data: SignInEnvelope | null = null;
      if (contentType.includes("application/json") && rawBody.trim()) {
        try {
          data = JSON.parse(rawBody) as SignInEnvelope;
        } catch {
          data = null;
        }
      }

      if (response.ok && isDashboardSignIn(data) && setCookie.length > 0) {
        return storeTexasSession(username, password, setCookie);
      }

      lastError = `fetch HTTP ${response.status}, message=${data?.result?.message ?? "non-JSON"}`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }

    throw new Error(
      `Texas sign-in failed for ${username}: ${lastError} (api=${baseUrl})`
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
    invalidateToken(
      normalizeTexasUsername(credentials.username),
      normalizeTexasPassword(credentials.password)
    );
    return this.getClient(credentials);
  }

  async getToken(credentials: TexasCredentials): Promise<string> {
    return this.signIn(credentials);
  }

  /** Confirm session works against a protected endpoint. */
  async verifySession(credentials: TexasCredentials): Promise<void> {
    const client = await this.getClient(credentials);
    const res = await client.post("/Agent/getAgentAllWallets", {});
    if (!res.data?.status) {
      throw new Error("Texas session invalid after sign-in (wallets check failed)");
    }
  }

  static tokenFromCookies(setCookieHeaders: string[]): string {
    return toToken(setCookieHeaders);
  }
}
