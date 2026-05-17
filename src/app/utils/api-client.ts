import axios, { type AxiosInstance } from "axios";
import { cookiesToHeader, fromToken } from "@/app/utils/token-manager";

const TEXAS_API_BASE_URL =
  process.env.TEXAS_API_BASE_URL ?? process.env.NEXT_PUBLIC_TEXAS_API_BASE_URL;

if (!TEXAS_API_BASE_URL) {
  console.warn(
    "[api-client] TEXAS_API_BASE_URL is not set — Texas API calls will fail at runtime."
  );
}

/** Unauthenticated client — used only for /User/signIn. */
export const api = axios.create({
  baseURL: TEXAS_API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
  validateStatus: (status) => status < 500,
});

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
  return axios.create({
    baseURL: TEXAS_API_BASE_URL,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookiesToHeader(cookies),
    },
    withCredentials: true,
    validateStatus: (status) => status < 500,
  });
}
