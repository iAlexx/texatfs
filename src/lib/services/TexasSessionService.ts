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
  buildTexasBrowserHeaders,
  buildTexasSignInBody,
  buildTexasSignInUrls,
  extractSetCookieHeaders,
  getTexasSignInErrorMessage,
  isTexasSignInSuccess,
  logTexasSignInFailure,
  normalizeTexasPassword,
  normalizeTexasUsername,
  type TexasSignInEnvelope,
} from "@/lib/texas/texas-api-config";
import type { TexasCredentials } from "@/lib/texas/types";

interface TexasApiEnvelope<T = unknown> {
  status?: boolean;
  result?: T;
}

/**
 * Multi-tenant Texas authentication — always uses caller-supplied credentials.
 * Never reads TEXAS_SYNC_* env vars.
 */
export class TexasSessionService {
  async signIn(credentials: TexasCredentials): Promise<string> {
    const username = normalizeTexasUsername(credentials.username);
    const password = normalizeTexasPassword(credentials.password);

    const cached = findValidTokenOf(username, password, new Date());
    if (cached) return cached;

    const baseUrl = getTexasApiBaseUrl();
    const body = buildTexasSignInBody(username, password);
    const headers = buildTexasBrowserHeaders();
    const urls = buildTexasSignInUrls(baseUrl);

    let lastError = "unknown";

    for (const url of urls) {
      try {
        const axiosRes = await axios.post<TexasSignInEnvelope>(url, body, {
          headers,
          validateStatus: () => true,
          maxRedirects: 5,
          timeout: 30_000,
        });

        const setCookie = extractSetCookieHeaders(
          axiosRes.headers as Record<string, unknown>
        );
        const data = axiosRes.data;

        if (
          axiosRes.status >= 200 &&
          axiosRes.status < 300 &&
          isTexasSignInSuccess(data) &&
          setCookie.length > 0
        ) {
          return storeTexasSession(username, password, setCookie);
        }

        const texasMessage = getTexasSignInErrorMessage(data);
        lastError = `HTTP ${axiosRes.status}, texas=${texasMessage}, cookies=${setCookie.length}`;

        logTexasSignInFailure({
          username,
          url,
          httpStatus: axiosRes.status,
          cookieCount: setCookie.length,
          texasMessage,
          bodyPreview: JSON.stringify(data ?? ""),
        });
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        console.error("[TexasSessionService] signIn transport error", {
          username,
          url,
          error: lastError,
        });
      }
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

  /**
   * Onboarding validation: POST /User/signIn (type === 0) + POST /Agent/getAgentAllWallets.
   */
  async verifyAgentAccount(credentials: TexasCredentials): Promise<void> {
    const username = normalizeTexasUsername(credentials.username);
    const password = normalizeTexasPassword(credentials.password);

    const client = await this.getClient({ username, password });

    const walletsRes = await client.post<TexasApiEnvelope<unknown[]>>(
      "/Agent/getAgentAllWallets",
      {},
      { validateStatus: () => true }
    );

    if (walletsRes.status === 401 || walletsRes.status === 403) {
      console.error("[TexasSessionService] wallets rejected", {
        username,
        httpStatus: walletsRes.status,
        bodyPreview: JSON.stringify(walletsRes.data ?? "").slice(0, 300),
      });
      throw new Error(
        `Texas sign-in failed: wallet API returned HTTP ${walletsRes.status} (session not accepted)`
      );
    }

    if (!walletsRes.data?.status) {
      console.error("[TexasSessionService] wallets invalid", {
        username,
        httpStatus: walletsRes.status,
        bodyPreview: JSON.stringify(walletsRes.data ?? "").slice(0, 300),
      });
      throw new Error(
        "Texas sign-in failed: agent wallet access denied (not an active agent account)"
      );
    }
  }

  /** @deprecated Use verifyAgentAccount */
  async verifySession(credentials: TexasCredentials): Promise<void> {
    return this.verifyAgentAccount(credentials);
  }

  static tokenFromCookies(setCookieHeaders: string[]): string {
    return toToken(setCookieHeaders);
  }
}
