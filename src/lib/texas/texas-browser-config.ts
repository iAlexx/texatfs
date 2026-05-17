/** Env flags for Texas browser login — no Puppeteer imports. */

export function isTexasBrowserLoginEnabled(): boolean {
  return process.env.TEXAS_BROWSER_LOGIN !== "false";
}

export function isTexasBrowserLoginFallbackEnabled(): boolean {
  return process.env.TEXAS_BROWSER_LOGIN_FALLBACK === "true";
}

export function isRailwayRuntime(): boolean {
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_SERVICE_ID ||
      process.env.RAILWAY_PROJECT_ID
  );
}
