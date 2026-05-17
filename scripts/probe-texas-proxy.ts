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
  const { texasBrowserFetch, parseTexasJsonBody } = await import(
    "../src/lib/texas/texas-browser-fetch"
  );
  const { isTexasSignInSuccess } = await import("../src/lib/texas/texas-api-config");
  const { isTexasProxyEnabled, getTexasProxyLogLabel } = await import(
    "../src/lib/texas/texas-proxy"
  );

  const user = process.env.TEXAS_SYNC_USERNAME;
  const pass = process.env.TEXAS_SYNC_PASSWORD;
  if (!user || !pass) throw new Error("Set TEXAS_SYNC_* in .env.local");

  console.log(
    JSON.stringify({
      proxyEnabled: isTexasProxyEnabled(),
      proxy: getTexasProxyLogLabel(),
    })
  );

  const r = await texasBrowserFetch({
    url: "https://agents.texas4win.com/global/api/User/signIn",
    method: "POST",
    body: JSON.stringify({ username: user, password: pass }),
    skipWarmUp: true,
  });

  const data = parseTexasJsonBody(r.bodyText);
  console.log(
    JSON.stringify(
      {
        httpStatus: r.status,
        signInOk: isTexasSignInSuccess(data),
        cookieCount: r.setCookies.length,
        isCloudflareHtml: r.bodyText.includes("Cloudflare"),
        bodyPreview: r.bodyText.slice(0, 200),
      },
      null,
      2
    )
  );

  if (!isTexasSignInSuccess(data)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
