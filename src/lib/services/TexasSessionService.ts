import { cookiesToHeader, fromToken, toToken } from "@/app/utils/token-manager";
import { getTexasApiBaseUrl } from "@/app/utils/api-client";
import {
  findValidTokenOf,
  invalidateToken,
  storeTexasSession,
  texasSessionCacheKey,
} from "@/app/utils/token-cache";
import {
  buildTexasSignInUrls,
  getTexasSignInErrorMessage,
  isTexasSignInSuccess,
  logTexasSignInFailure,
  normalizeTexasPassword,
  normalizeTexasUsername,
} from "@/lib/texas/texas-api-config";
import {
  isTexasBrowserLoginEnabled,
  isTexasBrowserLoginFallbackEnabled,
} from "@/lib/texas/texas-browser-config";
import {
  createTexasHttpClient,
  wrapTexasHttpClientWithRefresh,
  type TexasHttpClient,
} from "@/lib/texas/texas-http-client";
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

/**
 * Multi-tenant Texas authentication + undici HTTP client builder.
 *
 * Policy:
 *  • Valid cached session (55 min) → HTTP only, no Chromium.
 *  • Cache miss → HTTP sign-in first; Puppeteer only if HTTP fails.
 *  • Concurrent sign-ins → singleflight.
 *  • All Texas API calls → undici (never Next.js fetch / axios).
 *  • HTTP 401 → invalidate + re-auth + retry once.
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
    const { texasHttpSignInWithWarmUp } = await import(
      "@/lib/texas/texas-http-sign-in"
    );
    const result = await texasHttpSignInWithWarmUp(username, password);

    if (result.ok) {
      return {
        ok: true,
        setCookies: result.setCookies,
        httpStatus: result.httpStatus,
        texasMessage: result.texasMessage,
        bodyPreview: result.bodyPreview,
      };
    }

    if (result.httpStatus === 0) {
      console.error("[TexasSessionService] HTTP signIn transport error", {
        username,
        error: result.texasMessage,
      });
    }

    return {
      ok: false,
      setCookies: result.setCookies,
      httpStatus: result.httpStatus,
      texasMessage: result.texasMessage,
      bodyPreview: result.bodyPreview,
    };
  }

  private clientFromToken(token: string): TexasHttpClient {
    return createTexasHttpClient(cookiesToHeader(fromToken(token)));
  }

  /**
   * Authenticated undici client for all Texas portal API calls.
   */
  async getClient(credentials: TexasCredentials): Promise<TexasHttpClient> {
    const username = normalizeTexasUsername(credentials.username);
    const password = normalizeTexasPassword(credentials.password);

    const token = await this.signIn(credentials);
    let client = this.clientFromToken(token);

    return wrapTexasHttpClientWithRefresh(client, async () => {
      console.warn("[texas-auth] HTTP 401 — invalidating session", {
        username,
      });
      invalidateToken(username, password);
      const newToken = await this.signIn(credentials);
      client = this.clientFromToken(newToken);
      return client;
    });
  }

  getClientFromToken(token: string): TexasHttpClient {
    return this.clientFromToken(token);
  }

  async refresh(credentials: TexasCredentials): Promise<TexasHttpClient> {
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
