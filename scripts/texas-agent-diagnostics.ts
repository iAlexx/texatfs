/**
 * Compare Transaction vs General report for one Texas affiliate.
 *
 * Usage:
 *   TEXAS_SYNC_USERNAME=... TEXAS_SYNC_PASSWORD=... \
 *   TEXAS_DIAG_AFFILIATE_ID=2715065 TEXAS_DIAG_USERNAME=Mohammad55 \
 *   npx tsx scripts/texas-agent-diagnostics.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  const root = resolve(__dirname, "..");
  loadEnvFile(resolve(root, ".env.local"));
  loadEnvFile(resolve(root, ".env"));

  const affiliateId = process.env.TEXAS_DIAG_AFFILIATE_ID?.trim();
  if (!affiliateId) {
    throw new Error("Set TEXAS_DIAG_AFFILIATE_ID (e.g. 2715065 for Mohammad55)");
  }

  const username = process.env.TEXAS_DIAG_USERNAME?.trim() ?? null;
  const password = process.env.TEXAS_SYNC_PASSWORD;
  const user = process.env.TEXAS_SYNC_USERNAME;
  if (!user || !password) {
    throw new Error("Set TEXAS_SYNC_USERNAME and TEXAS_SYNC_PASSWORD");
  }

  const { TexasSessionService } = await import(
    "../src/lib/services/TexasSessionService"
  );
  const { runTexasPanelDiagnostics } = await import(
    "../src/lib/texas/texas-panel-diagnostics"
  );

  const session = new TexasSessionService();
  const client = await session.getClient({ username: user, password });

  const result = await runTexasPanelDiagnostics({
    client,
    affiliateId,
    username,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
