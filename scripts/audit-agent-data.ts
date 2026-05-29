/**
 * CLI: npx tsx scripts/audit-agent-data.ts --viewerUserId=<uuid> [--ledgerDate=YYYY-MM-DD] [--repair]
 */
import { resolveLedgerDate } from "@/lib/cron/ledger-date";
import { runAgentDataAudit } from "@/lib/diagnostics/agent-data-audit";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { TexasSessionService } from "@/lib/services/TexasSessionService";
import { requireUserCredentials } from "@/lib/scraper/resolve-user-credentials";

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
    if (arg === `--${name}`) return "true";
  }
  return undefined;
}

async function main() {
  const viewerUserId = parseArg("viewerUserId");
  const telegramUserIdRaw = parseArg("telegramUserId");
  const ledgerDate = parseArg("ledgerDate") ?? resolveLedgerDate();
  const repair = parseArg("repair") === "true";

  if (!viewerUserId && !telegramUserIdRaw) {
    console.error("Usage: tsx scripts/audit-agent-data.ts --viewerUserId=<uuid>");
    process.exit(1);
  }

  const supabase = getSupabaseServiceClient();
  let texasClient = undefined as Awaited<
    ReturnType<TexasSessionService["getClient"]>
  > | undefined;

  const resolvedViewerId = viewerUserId;
  if (resolvedViewerId) {
    try {
      const creds = await requireUserCredentials(supabase, resolvedViewerId);
      const session = new TexasSessionService();
      texasClient = await session.getClient({
        username: creds.username,
        password: creds.password,
      });
    } catch (e) {
      console.warn("Texas client unavailable:", e instanceof Error ? e.message : e);
    }
  }

  const report = await runAgentDataAudit({
    supabase,
    viewerUserId,
    telegramUserId: telegramUserIdRaw ? Number(telegramUserIdRaw) : undefined,
    ledgerDate,
    texasClient,
    repair,
  });

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
