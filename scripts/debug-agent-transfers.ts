/**
 * Raw Texas Transaction (getAgentsTransfers) inspector for ONE affiliate.
 *
 * Proves whether type=3 (withdraw) records exist and how they are shaped, then
 * shows exactly how robust attribution classifies them — no guessing.
 *
 * Usage:
 *   npx tsx scripts/debug-agent-transfers.ts \
 *     --viewerUserId=<masterUuid> \
 *     --affiliateId=<mohammad55AffiliateId> \
 *     [--username=mohammad55] \
 *     [--ledgerDate=2026-05-29]
 *
 * Auth: resolves the viewer's stored Texas credentials (same as the app), or
 * falls back to TEXAS_SYNC_USERNAME / TEXAS_SYNC_PASSWORD env vars.
 */
import { resolveLedgerDate } from "@/lib/cron/ledger-date";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { TexasSessionService } from "@/lib/services/TexasSessionService";
import { requireUserCredentials } from "@/lib/scraper/resolve-user-credentials";
import {
  buildTransferDateFilter,
  fetchAgentTransfers,
} from "@/lib/texas/fetch-agent-transfers";
import { resolveMonthStart } from "@/lib/accounting/monthly-ledger-view";
import { diagnoseAffiliateTransfers } from "@/lib/texas/transfer-affiliate-attribution";
import type { AgentTransferRecord, TexasFilterMap } from "@/lib/texas/types";
import type { TexasHttpClient } from "@/lib/texas/texas-http-client";

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
    if (arg === `--${name}`) return "true";
  }
  return undefined;
}

function previousCalendarDay(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function printRawTypeSamples(records: AgentTransferRecord[]): void {
  const type3 = records.filter((r) => {
    const t = String((r as Record<string, unknown>).type ?? "").trim();
    return t === "3" || t.toLowerCase() === "withdraw";
  });
  console.log(`\n--- RAW type=3 (withdraw) sample keys (count=${type3.length}) ---`);
  for (const rec of type3.slice(0, 5)) {
    const bag = rec as Record<string, unknown>;
    const keys = Object.keys(bag).sort();
    const values: Record<string, unknown> = {};
    for (const k of keys) values[k] = bag[k];
    console.log(JSON.stringify({ keys: keys.join(","), values }, null, 2));
  }
  if (type3.length === 0) {
    console.log("NO type=3 records returned by Texas for this fetch.");
  }
}

async function fetchVariant(
  client: TexasHttpClient,
  label: string,
  affiliateId: string,
  extraFilter?: TexasFilterMap
): Promise<AgentTransferRecord[]> {
  console.log(`\n================ FETCH: ${label} ================`);
  const result = await fetchAgentTransfers(client, {
    paginate: true,
    extraFilter,
  });
  console.log(
    JSON.stringify(
      {
        endpoint: "/Statistics/getAgentsTransfers",
        requestFilter: { type: ["2", "3"], extra: extraFilter ?? null },
        pagesFetched: result.pagesFetched,
        totalRecordsFetched: result.records.length,
        networkTotals: result.totals,
      },
      null,
      2
    )
  );

  const diag = diagnoseAffiliateTransfers(result.records, affiliateId);
  console.log(
    JSON.stringify(
      {
        rawClassification: {
          totalRecords: diag.totalRecords,
          type2Count: diag.type2Count,
          type3Count: diag.type3Count,
          otherTypeCount: diag.otherTypeCount,
        },
        amountTotalsBeforeAttribution: {
          allDepositAmountSum: diag.allDepositAmountSum,
          allWithdrawAmountSum: diag.allWithdrawAmountSum,
        },
        finalTotals: {
          attributedDeposit: diag.attributed.totalDeposit,
          attributedWithdraw: diag.attributed.totalWithdraw,
          matchedDeposits: diag.attributed.matchedDeposits,
          matchedWithdraws: diag.attributed.matchedWithdraws,
          skipped: diag.attributed.skipped,
          duplicateSkipped: diag.attributed.duplicateSkipped,
          suspiciousDeposits: diag.attributed.suspiciousDeposits,
          suspiciousWithdraws: diag.attributed.suspiciousWithdraws,
          zeroAmountRecords: diag.attributed.zeroAmountRecords,
        },
      },
      null,
      2
    )
  );

  console.log(`\n--- Matching/suspicious records for affiliate ${affiliateId} ---`);
  for (const rec of diag.matchingRecords) {
    console.log(JSON.stringify(rec));
  }
  if (diag.suspiciousWithdrawRecords.length > 0) {
    console.log(`\n--- SUSPICIOUS withdraw records (counted but unexpected side) ---`);
    for (const rec of diag.suspiciousWithdrawRecords) {
      console.log(JSON.stringify(rec));
    }
  }

  printRawTypeSamples(result.records);
  return result.records;
}

async function main() {
  const viewerUserId = parseArg("viewerUserId");
  const affiliateId = parseArg("affiliateId")?.trim();
  const ledgerDate = parseArg("ledgerDate") ?? resolveLedgerDate();

  if (!affiliateId) {
    console.error(
      "Usage: tsx scripts/debug-agent-transfers.ts --viewerUserId=<uuid> --affiliateId=<id> [--ledgerDate=YYYY-MM-DD]"
    );
    process.exit(1);
  }

  const supabase = getSupabaseServiceClient();
  const session = new TexasSessionService();

  let client: TexasHttpClient;
  if (viewerUserId) {
    const creds = await requireUserCredentials(supabase, viewerUserId);
    client = await session.getClient({
      username: creds.username,
      password: creds.password,
    });
  } else {
    const username = process.env.TEXAS_SYNC_USERNAME;
    const password = process.env.TEXAS_SYNC_PASSWORD;
    if (!username || !password) {
      throw new Error(
        "Provide --viewerUserId=<uuid> OR set TEXAS_SYNC_USERNAME/TEXAS_SYNC_PASSWORD"
      );
    }
    client = await session.getClient({ username, password });
  }

  console.log(
    JSON.stringify(
      { affiliateId, ledgerDate, viewerUserId: viewerUserId ?? "(env creds)" },
      null,
      2
    )
  );

  const monthStart = resolveMonthStart(ledgerDate);
  const dayBeforeMonth = previousCalendarDay(monthStart);

  // TRUTH SOURCE FIRST: unfiltered (type 2/3 only) — the path that showed correct numbers.
  await fetchVariant(client, "NO DATE FILTER (truth source)", affiliateId);

  // Comparisons (do not trust until validated):
  await fetchVariant(
    client,
    `MONTH RANGE ${monthStart}..${ledgerDate}`,
    affiliateId,
    buildTransferDateFilter(monthStart, ledgerDate)
  );
  await fetchVariant(
    client,
    `THROUGH ledgerDate 2000-01-01..${ledgerDate}`,
    affiliateId,
    buildTransferDateFilter("2000-01-01", ledgerDate)
  );
  await fetchVariant(
    client,
    `THROUGH dayBeforeMonth 2000-01-01..${dayBeforeMonth} (baseline)`,
    affiliateId,
    buildTransferDateFilter("2000-01-01", dayBeforeMonth)
  );

  console.log("\n================ DONE ================");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : e);
  process.exitCode = 1;
});
