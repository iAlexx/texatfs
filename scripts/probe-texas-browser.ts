import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
  }
}

loadEnv(resolve(__dirname, "../.env.local"));

async function main() {
  const { isTexasSignInSuccess } = await import("../src/lib/texas/texas-api-config");
  const { isTexasProxyEnabled, getTexasProxyLogLabel } = await import(
    "../src/lib/texas/texas-proxy"
  );
  const { texasBrowserSignIn } = await import("../src/lib/texas/texas-puppeteer-login");
  const { classifyPuppeteerError, isRetryable, isAlertWorthy } = await import(
    "../src/lib/texas/puppeteer-errors"
  );
  const { withPuppeteerResilience } = await import(
    "../src/lib/texas/puppeteer-resilience"
  );

  const user = process.env.TEXAS_SYNC_USERNAME;
  const pass = process.env.TEXAS_SYNC_PASSWORD;
  if (!user || !pass) throw new Error("Set TEXAS_SYNC_USERNAME and TEXAS_SYNC_PASSWORD in .env.local");

  const { isLocalDebugMode } = await import("../src/lib/texas/texas-browser-config");
  const useResilience = process.env.PROBE_RESILIENCE !== "false";

  console.log(
    JSON.stringify({
      localDebug: isLocalDebugMode(),
      proxyEnabled: isTexasProxyEnabled(),
      proxy: getTexasProxyLogLabel(),
      browserless: Boolean(process.env.BROWSERLESS_WS_ENDPOINT),
      resilienceEnabled: useResilience,
    })
  );

  const doSignIn = () => texasBrowserSignIn({ username: user, password: pass });

  const result = useResilience
    ? await withPuppeteerResilience(doSignIn, "probe-texas-browser", {
        userId: "probe-script",
        maxRetries: 1,
      })
    : await doSignIn();

  console.log(
    JSON.stringify(
      {
        httpStatus: result.httpStatus,
        signInOk: isTexasSignInSuccess(result.signInData),
        cookieCount: result.setCookies.length,
        texasResult: result.signInData?.result,
      },
      null,
      2
    )
  );

  if (!isTexasSignInSuccess(result.signInData) || result.setCookies.length === 0) {
    process.exit(1);
  }
}

main().catch(async (e) => {
  const { classifyPuppeteerError, isRetryable, isAlertWorthy } = await import(
    "../src/lib/texas/puppeteer-errors"
  );

  const errorType = classifyPuppeteerError(e);
  const message = e instanceof Error ? e.message : String(e);

  console.error(
    JSON.stringify(
      {
        ok: false,
        error: message,
        classification: {
          type: errorType,
          retryable: isRetryable(errorType),
          alertWorthy: isAlertWorthy(errorType),
        },
      },
      null,
      2
    )
  );
  process.exit(1);
});
