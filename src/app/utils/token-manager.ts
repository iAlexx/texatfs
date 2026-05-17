/**
 * Serializes Texas dashboard Set-Cookie headers into a Bearer token
 * used by API route handlers and background workers.
 */
export function toToken(setCookieHeaders: string[]): string {
  return Buffer.from(JSON.stringify(setCookieHeaders), "utf8").toString(
    "base64url"
  );
}

export function fromToken(token: string): string[] {
  const parsed: unknown = JSON.parse(
    Buffer.from(token, "base64url").toString("utf8")
  );
  if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "string")) {
    throw new Error("Invalid Texas session token payload");
  }
  return parsed;
}

/** Join Set-Cookie lines into a single Cookie request header value. */
export function cookiesToHeader(setCookieHeaders: string[]): string {
  return setCookieHeaders
    .map((line) => line.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}
