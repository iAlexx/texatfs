export function verifyCronSecret(request: Request): void {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    throw new CronAuthError("CRON_SECRET is not configured", 500);
  }

  const auth = request.headers.get("authorization");
  const header = request.headers.get("x-cron-secret");

  const bearer =
    auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : null;

  if (bearer !== secret && header !== secret) {
    throw new CronAuthError("Unauthorized cron request", 401);
  }
}

export function getRenderToken(): string {
  const token =
    process.env.REPORT_RENDER_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim();
  if (!token) {
    throw new Error("CRON_SECRET or REPORT_RENDER_SECRET must be set");
  }
  return token;
}

export function verifyRenderToken(token: string | null | undefined): boolean {
  if (!token) return false;
  try {
    return token === getRenderToken();
  } catch {
    return false;
  }
}

export class CronAuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 500 = 401
  ) {
    super(message);
    this.name = "CronAuthError";
  }
}
