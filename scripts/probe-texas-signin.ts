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

const user = process.env.TEXAS_SYNC_USERNAME;
const pass = process.env.TEXAS_SYNC_PASSWORD;
if (!user || !pass) {
  console.error("Set TEXAS_SYNC_USERNAME and TEXAS_SYNC_PASSWORD in .env.local");
  process.exit(1);
}

async function main() {
  const { normalizeTexasApiBaseUrl } = await import(
    "../src/lib/texas/texas-api-config"
  );
  const { TexasSessionService } = await import(
    "../src/lib/services/TexasSessionService"
  );

  const raw = process.env.TEXAS_API_BASE_URL ?? "";
  const normalized = normalizeTexasApiBaseUrl(raw);
  console.log(JSON.stringify({ raw, normalized }, null, 2));

  const session = new TexasSessionService();
  const token = await session.signIn({ username: user, password: pass });
  const client = session.getClientFromToken(token);
  const wallets = await client.post("/Agent/getAgentAllWallets", {});

  console.log(
    JSON.stringify(
      {
        ok: true,
        tokenLength: token.length,
        walletsStatus: wallets.status,
        walletCount: Array.isArray(wallets.data?.result)
          ? wallets.data.result.length
          : null,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
