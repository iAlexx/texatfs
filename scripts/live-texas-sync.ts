import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type SyncRole = "super_master" | "master" | "player";

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;

  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equals = trimmed.indexOf("=");
    if (equals === -1) continue;

    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function parseRole(value: string | undefined): SyncRole {
  if (value === "super_master" || value === "master" || value === "player") {
    return value;
  }
  return "master";
}

function keysOf(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value).sort();
}

async function main() {
  const root = resolve(__dirname, "..");
  loadEnvFile(resolve(root, ".env.local"));
  loadEnvFile(resolve(root, ".env"));

  const baseUrl = requireEnv("TEXAS_API_BASE_URL");
  const username = requireEnv("TEXAS_SYNC_USERNAME");
  const password = requireEnv("TEXAS_SYNC_PASSWORD");

  const { TexasSyncService } = await import(
    "../src/lib/services/TexasSyncService"
  );

  const service = new TexasSyncService();
  const pageSize = Number(process.env.TEXAS_SYNC_PAGE_SIZE ?? 1000);

  const result = await service.syncUser(
    {
      userId: process.env.TEXAS_SYNC_USER_ID ?? "live-smoke-test",
      texasAffiliateId: process.env.TEXAS_SYNC_AFFILIATE_ID || null,
      role: parseRole(process.env.TEXAS_SYNC_ROLE),
      credentials: { username, password },
    },
    { pageSize }
  );

  const records = Array.isArray(result.snapshot.rawStatistics.records)
    ? result.snapshot.rawStatistics.records
    : [];
  const firstRecord = records[0];

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl: new URL(baseUrl).origin,
        userId: result.userId,
        role: parseRole(process.env.TEXAS_SYNC_ROLE),
        affiliateScoped: Boolean(process.env.TEXAS_SYNC_AFFILIATE_ID),
        pagesFetched: result.pagesFetched,
        recordCount: result.recordCount,
        snapshot: {
          currencyCode: result.snapshot.currencyCode,
          balance: result.snapshot.balance,
          totalDeposit: result.snapshot.totalDeposit,
          totalWithdraw: result.snapshot.totalWithdraw,
          ngr: result.snapshot.ngr,
        },
        rawShape: {
          walletKeys: keysOf(result.snapshot.rawWallets),
          statisticsKeys: keysOf(result.snapshot.rawStatistics),
          firstRecordKeys: keysOf(firstRecord),
          totalKeys: keysOf(result.snapshot.rawStatistics.total),
        },
      },
      null,
      2
    )
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: message,
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
