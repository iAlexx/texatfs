import type { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { getApiClientFromToken, getTexasApiBaseUrl } from "@/app/utils/api-client";
import {
  findValidTokenOf,
  invalidateToken,
  storeTexasSession,
  texasSessionCacheKey,
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
  isTexasBrowserLoginEnabled,
  isTexasBrowserLoginFallbackEnabled,
} from "@/lib/texas/texas-browser-config";
import { coalesceTexasSignIn } from "@/lib/texas/texas-sign-in-flight";
import type { TexasCredentials } from "@/lib/texas/types";

interface TexasApiEnvelope<T = unknown> {
  status?: boolean;
  result?: T;
}

interface HttpSignInAttempt {
  ok: boolean;
  setCookies: string[];
  httpStatus: number;
  texasMessage: string;
  bodyPreview: string;
}

type RetriableAxiosConfig = InternalAxiosRequestConfig & {
  __texasSessionRetried?: boolean;
};

/**
 * Multi-tenant Texas authentication.
 *
 * Policy:
 *  • Valid cached session (55 min) → HTTP only, no Chromium.
 *  • Cache miss → HTTP sign-in first; Puppeteer only if HTTP fails.
 *  • Concurrent sign-ins for the same user → singleflight (one launch).
 *  • HTTP 401 on API calls → invalidate cache, re-auth (HTTP first), retry once.
 */
export class TexasSessionService {
  async signIn(credentials: TexasCredentials): Promise<string> {
    const username = normalizeTexasUsername(credentials.username);
    const password = normalizeTexasPassword(credentials.password);

    const cached = findValidTokenOf(username, password, new Date());
    if (cached) {
      console.info("[texas-auth] session from cache (HTTP-only mode)", {
        username,
      });
      return cached;
    }

    const flightKey = texasSessionCacheKey(username, password);
    return coalesceTexasSignIn(flightKey, () =>
      this.signInFresh(username, password)
    );
  }

  /**
   * HTTP-first fresh sign-in. Puppeteer is the last resort on cache miss.
   */
  private async signInFresh(
    username: string,
    password: string
  ): Promise<string> {
    console.info("[texas-auth] fresh sign-in required (cache miss)", {
      username,
    });

    const baseUrl = getTexasApiBaseUrl();
    let lastError = "unknown";

    const httpAttempt = await this.tryHttpSignIn(username, password);
    if (httpAttempt.ok) {
      console.info("[TexasSessionService] signIn success via HTTP", {
        username,
        cookieCount: httpAttempt.setCookies.length,
      });
      return storeTexasSession(username, password, httpAttempt.setCookies);
    }

    lastError = `HTTP ${httpAttempt.httpStatus}, texas=${httpAttempt.texasMessage}, cookies=${httpAttempt.setCookies.length}`;
    logTexasSignInFailure({
      username,
      url: buildTexasSignInUrls(baseUrl)[0] ?? baseUrl,
      httpStatus: httpAttempt.httpStatus,
      cookieCount: httpAttempt.setCookies.length,
      texasMessage: httpAttempt.texasMessage,
      bodyPreview: httpAttempt.bodyPreview,
    });

    if (isTexasBrowserLoginEnabled()) {
      try {
        const { texasBrowserSignIn } = await import(
          "@/lib/texas/texas-puppeteer-login"
        );
        console.info("[TexasSessionService] HTTP failed — Puppeteer signIn", {
          username,
        });
        const browserResult = await texasBrowserSignIn({ username, password });
        const { setCookies, signInData, httpStatus } = browserResult;

        if (isTexasSignInSuccess(signInData) && setCookies.length > 0) {
          console.info("[TexasSessionService] signIn success via Puppeteer UI", {
            username,
            cookieCount: setCookies.length,
          });
          return storeTexasSession(username, password, setCookies);
        }

        const texasMessage = getTexasSignInErrorMessage(signInData, httpStatus);
        lastError = `browser: HTTP ${httpStatus}, texas=${texasMessage}, cookies=${setCookies.length}`;

        logTexasSignInFailure({
          username,
          url: `${baseUrl}/User/signIn`,
          httpStatus,
          cookieCount: setCookies.length,
          texasMessage,
          bodyPreview: signInData ? JSON.stringify(signInData) : "",
          attempt: 1,
        });
      } catch (e) {
        lastError = `browser: ${e instanceof Error ? e.message : String(e)}`;
        console.error("[TexasSessionService] Puppeteer signIn error", {
          username,
          error: lastError,
        });
      }

      if (!isTexasBrowserLoginFallbackEnabled()) {
        throw new Error(
          `Texas sign-in failed for ${username}: ${lastError} (api=${baseUrl})`
        );
      }
    }

    throw new Error(
      `Texas sign-in failed for ${username}: ${lastError} (api=${baseUrl})`
    );
  }

  private async tryHttpSignIn(
    username: string,
    password: string
  ): Promise<HttpSignInAttempt> {
    const baseUrl = getTexasApiBaseUrl();
    const bodyJson = JSON.stringify(buildTexasSignInBody(username, password));
    const urls = buildTexasSignInUrls(baseUrl);

    try {
      const { texasSignInWithWarmUp, parseTexasJsonBody } = await import(
        "@/lib/texas/texas-browser-fetch"
      );
      const { status, bodyText, jar } = await texasSignInWithWarmUp({
        signInUrls: urls,
        body: bodyJson,
      });

      const data = parseTexasJsonBody<TexasSignInEnvelope>(bodyText);
      const setCookies = jar.allSetCookieLines();
      const texasMessage = getTexasSignInErrorMessage(data, status);

      if (
        status >= 200 &&
        status < 300 &&
        isTexasSignInSuccess(data) &&
        setCookies.length > 0
      ) {
        return {
          ok: true,
          setCookies,
          httpStatus: status,
          texasMessage,
          bodyPreview: bodyText.slice(0, 300),
        };
      }

      return {
        ok: false,
        setCookies,
        httpStatus: status,
        texasMessage:
          status === 403
            ? "HTTP 403 Forbidden (Cloudflare/WAF)"
            : texasMessage,
        bodyPreview: bodyText || JSON.stringify(data ?? ""),
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[TexasSessionService] HTTP signIn transport error", {
        username,
        error: message,
      });
      return {
        ok: false,
        setCookies: [],
        httpStatus: 0,
        texasMessage: message,
        bodyPreview: "",
      };
    }
  }

  async getClient(credentials: TexasCredentials): Promise<AxiosInstance> {
    const username = normalizeTexasUsername(credentials.username);
    const password = normalizeTexasPassword(credentials.password);
    const token = await this.signIn(credentials);
    const client = getApiClientFromToken(token);

    client.interceptors.response.use(
      (response) => response,
      async (error: unknown) => {
        const axiosErr = error as {
          response?: { status?: number };
          config?: RetriableAxiosConfig;
        };
        const status = axiosErr.response?.status;
        const config = axiosErr.config;

        if (
          status === 401 &&
          config &&
          !config.__texasSessionRetried
        ) {
          console.warn("[texas-auth] HTTP 401 — invalidating session", {
            username,
          });
          invalidateToken(username, password);
          config.__texasSessionRetried = true;

          const newToken = await this.signIn(credentials);
          config.headers = config.headers ?? {};
          config.headers.Cookie = cookiesToHeader(fromToken(newToken));
          return client.request(config);
        }

        return Promise.reject(error);
      }
    );

    return client;
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

    await this.signIn({ username, password });

    // Puppeteer sign-in already validated the dashboard session; axios wallet
    // probes are often blocked by Cloudflare on Railway even with valid cookies.
    if (isTexasBrowserLoginEnabled()) {
      console.info(
        "[TexasSessionService] verifyAgentAccount: sign-in OK, skipping HTTP wallet probe",
        { username }
      );
      return;
    }

    const client = await this.getClient({ username, password });

    const { data } = await client.post<TexasApiEnvelope<unknown[]>>(
      "/Agent/getAgentAllWallets",
      {}
    );

    if (!data?.status) {
      console.error("[TexasSessionService] wallets invalid", { username });
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
