import axios, { type AxiosInstance } from "axios";
import { cookiesToHeader, fromToken } from "@/app/utils/token-manager";
import {
  buildTexasBrowserHeaders,
  resolveTexasApiBaseUrl,
} from "@/lib/texas/texas-api-config";

export function getTexasApiBaseUrl(): string {
  return resolveTexasApiBaseUrl();
}

function createTexasAxios(extraHeaders?: Record<string, string>): AxiosInstance {
  return axios.create({
    baseURL: getTexasApiBaseUrl(),
    headers: { ...buildTexasBrowserHeaders(), ...extraHeaders },
    withCredentials: true,
    validateStatus: (status) => status >= 200 && status < 300,
  });
}

/** Unauthenticated client — used only for /User/signIn. */
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
