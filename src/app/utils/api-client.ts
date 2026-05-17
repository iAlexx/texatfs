import axios, { type AxiosInstance } from "axios";
import { cookiesToHeader, fromToken } from "@/app/utils/token-manager";
import {
  buildTexasBrowserHeaders,
  CHROME_USER_AGENT,
  resolveTexasApiBaseUrl,
} from "@/lib/texas/texas-api-config";

export function getTexasApiBaseUrl(): string {
  return resolveTexasApiBaseUrl();
}

function stripAxiosFingerprint(
  headers: Record<string, unknown>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined || v === null) continue;
    const lower = k.toLowerCase();
    if (lower === "x-requested-with" || lower === "x-powered-by") continue;
    out[k] = String(v);
  }
  return out;
}

function createTexasAxios(extraHeaders?: Record<string, string>): AxiosInstance {
  const instance = axios.create({
    baseURL: getTexasApiBaseUrl(),
    withCredentials: true,
    validateStatus: (status) => status >= 200 && status < 300,
    maxRedirects: 5,
    timeout: 30_000,
  });

  instance.defaults.headers.common = {};
  instance.defaults.headers.post = {};
  instance.defaults.headers.get = {};

  instance.interceptors.request.use((config) => {
    const cookie = extraHeaders?.Cookie;
    const merged = stripAxiosFingerprint({
      ...buildTexasBrowserHeaders(cookie),
      ...stripAxiosFingerprint(
        (config.headers ?? {}) as Record<string, unknown>
      ),
      ...(extraHeaders ?? {}),
    });
    config.headers = axios.AxiosHeaders.from(merged);
    config.headers.set("User-Agent", CHROME_USER_AGENT, true);
    return config;
  });

  return instance;
}

export const api = {
  post: <T>(url: string, data?: unknown) =>
    createTexasAxios().post<T>(url, data),
};

export function getServerApiClient(request: Request): AxiosInstance {
  const header = request.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    throw new Error("Missing Authorization Bearer token for Texas API");
  }
  return getApiClientFromToken(token);
}

export function getApiClientFromToken(token: string): AxiosInstance {
  const cookies = fromToken(token);
  return createTexasAxios({ Cookie: cookiesToHeader(cookies) });
}
