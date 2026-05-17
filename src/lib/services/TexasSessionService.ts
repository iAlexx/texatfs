import type { AxiosInstance } from "axios";
import { getApiClientFromToken, getTexasApiBaseUrl } from "@/app/utils/api-client";
import {
  findValidTokenOf,
  invalidateToken,
  storeTexasSession,
} from "@/app/utils/token-cache";
import { cookiesToHeader, fromToken, toToken } from "@/app/utils/token-manager";
import {
  buildTexasSignInBody,
  buildTexasSignInUrls,
  getTexasSignInErrorMessage,
  isTexasSignInSuccess,
  logTexasSignInFailure,
  normalizeTexasPassword,
  normalizeTexasUsername,
  resolveTexasApiBaseUrl,
  type TexasSignInEnvelope,
} from "@/lib/texas/texas-api-config";
import {
  parseTexasJsonBody,
  TexasCookieJar,
  texasBrowserFetch,
  texasSignInWithWarmUp,
} from "@/lib/texas/texas-browser-fetch";
import type { TexasCredentials } from "@/lib/texas/types";

interface TexasApiEnvelope<T = unknown> {
  status?: boolean;
  result?: T;
}

/**
 * Multi-tenant Texas authentication with full portal warm-up before sign-in.
 */
export class TexasSessionService {
  async signIn(credentials: TexasCredentials): Promise<string> {
    const username = normalizeTexasUsername(credentials.username);
    const password = normalizeTexasPassword(credentials.password);

    const cached = findValidTokenOf(username, password, new Date());
    if (cached) return cached;

    const baseUrl = getTexasApiBaseUrl();
    const bodyJson = JSON.stringify(buildTexasSignInBody(username, password));
    const urls = buildTexasSignInUrls(baseUrl);

    let lastError = "unknown";

    try {
      const { status, bodyText, jar } = await texasSignInWithWarmUp({
        signInUrls: urls,
        body: bodyJson,
      });

      const data = parseTexasJsonBody<TexasSignInEnvelope>(bodyText);
      const setCookies = jar.allSetCookieLines();

      if (
        status >= 200 &&
        status < 300 &&
        isTexasSignInSuccess(data) &&
        setCookies.length > 0
      ) {
        console.info("[TexasSessionService] signIn success after warm-up", {
          username,
          cookieCount: setCookies.length,
        });
        return storeTexasSession(username, password, setCookies);
      }

      const texasMessage = getTexasSignInErrorMessage(data, status);
      lastError = `HTTP ${status}, texas=${texasMessage}, cookies=${setCookies.length}`;

      logTexasSignInFailure({
        username,
        url: urls[0] ?? baseUrl,
        httpStatus: status,
        cookieCount: setCookies.length,
        texasMessage,
        bodyPreview: bodyText || JSON.stringify(data ?? ""),
      });

      if (status === 403) {
        lastError = `HTTP 403 Forbidden (Cloudflare/WAF)`;
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.error("[TexasSessionService] signIn transport error", {
        username,
        error: lastError,
      });
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

  async verifyAgentAccount(credentials: TexasCredentials): Promise<void> {
    const username = normalizeTexasUsername(credentials.username);
    const password = normalizeTexasPassword(credentials.password);

    const token = await this.signIn({ username, password });
    const jar = new TexasCookieJar();
    const cookieHeader = cookiesToHeader(fromToken(token));

    const base = resolveTexasApiBaseUrl().replace(/\/$/, "");
    const walletsUrl = `${base}/Agent/getAgentAllWallets`;

    const result = await texasBrowserFetch({
      url: walletsUrl,
      method: "POST",
      body: "{}",
      jar,
      cookieHeader,
      skipWarmUp: true,
    });

    const data = parseTexasJsonBody<TexasApiEnvelope<unknown[]>>(result.bodyText);

    if (result.status === 401 || result.status === 403) {
      console.error("[TexasSessionService] wallets rejected", {
        username,
        httpStatus: result.status,
        bodyPreview: result.bodyText.slice(0, 300),
      });
      throw new Error(
        `Texas sign-in failed: wallet API returned HTTP ${result.status} (session not accepted)`
      );
    }

    if (!data?.status) {
      console.error("[TexasSessionService] wallets invalid", {
        username,
        httpStatus: result.status,
        bodyPreview: result.bodyText.slice(0, 300),
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
