import { NextResponse } from "next/server";
import { CronAuthError, verifyCronSecret } from "@/lib/cron/auth";
import { runDailySyncJob } from "@/lib/cron/daily-sync-job";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
/** Long-running: 60s delay × N users + Texas sync + screenshots. */
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

  const runInBackground = process.env.CRON_DAILY_SYNC_ASYNC !== "false";

  if (runInBackground) {
    void runDailySyncJob()
      .then((result) => {
        console.info("[cron/daily-sync] job finished", result);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[cron/daily-sync] job failed", msg, err);
      });

    return NextResponse.json({
      ok: true,
      started: true,
      message:
        "Daily sync started in background. Each user is spaced by CRON_USER_DELAY_MS (default 60s).",
    });
  }

  const result = await runDailySyncJob();
  return NextResponse.json({ ok: true, ...result });
}
