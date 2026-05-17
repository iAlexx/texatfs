import axios, { type AxiosInstance } from "axios";
import { cookiesToHeader, fromToken } from "@/app/utils/token-manager";
import {
  normalizeTexasApiBaseUrl,
  TEXAS_API_DEFAULT_HEADERS,
} from "@/lib/texas/texas-api-config";

function resolveTexasApiBaseUrl(): string | undefined {
  return normalizeTexasApiBaseUrl(
    process.env.TEXAS_API_BASE_URL ?? process.env.NEXT_PUBLIC_TEXAS_API_BASE_URL
  );
}

export function getTexasApiBaseUrl(): string {
  const base = resolveTexasApiBaseUrl();
  if (!base) {
    throw new Error(
      "TEXAS_API_BASE_URL is not configured (use https://agents.texas4win.com/global/api)"
    );
  }
  return base;
}

function createTexasAxios(extraHeaders?: Record<string, string>): AxiosInstance {
  return axios.create({
    baseURL: getTexasApiBaseUrl(),
    headers: { ...TEXAS_API_DEFAULT_HEADERS, ...extraHeaders },
    withCredentials: true,
    validateStatus: (status) => status >= 200 && status < 300,
  });
}

/** Unauthenticated client — used only for /User/signIn. */
export const api = {
  post: <T>(url: string, data?: unknown) =>
    createTexasAxios().post<T>(url, data),
};

/**
 * Request-scoped client for Next.js route handlers.
 * Reads `Authorization: Bearer <token>` where token encodes Set-Cookie headers.
 */
export function getServerApiClient(request: Request): AxiosInstance {
  const header = request.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    throw new Error("Missing Authorization Bearer token for Texas API");
  }
  return getApiClientFromToken(token);
}

/**
 * Background worker / cron client — pass the same Bearer token produced at sign-in.
 */
export function getApiClientFromToken(token: string): AxiosInstance {
  const cookies = fromToken(token);
  return createTexasAxios({ Cookie: cookiesToHeader(cookies) });
}
