import { NextResponse } from "next/server";
import { CronAuthError, verifyCronSecret } from "@/lib/cron/auth";
import { runDailyAgentLedgerDispatchJob } from "@/lib/cron/daily-agent-ledger-job";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
/** Long-running: screenshot each group can take time. */
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    verifyCronSecret(request);
  } catch (e) {
    if (e instanceof CronAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const runInBackground = process.env.CRON_DAILY_AGENT_LEDGER_ASYNC !== "false";

  if (runInBackground) {
    void runDailyAgentLedgerDispatchJob()
      .then((result) => {
        console.info("[cron/daily-agent-ledger] job finished", result);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[cron/daily-agent-ledger] job failed", msg, err);
      });

    return NextResponse.json({
      ok: true,
      started: true,
      message:
        "Daily agent ledger dispatch started in background. Each group is handled sequentially.",
    });
  }

  const result = await runDailyAgentLedgerDispatchJob();
  return NextResponse.json({ ok: true, ...result });
}

