import { NextResponse } from "next/server";
import { CronAuthError, verifyCronSecret } from "@/lib/cron/auth";
import { runWhatsAppBackfillAgentGroupsJob } from "@/lib/cron/whatsapp-backfill-agent-groups-job";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
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

  const runInBackground = process.env.CRON_WHATSAPP_BACKFILL_ASYNC !== "false";

  if (runInBackground) {
    void runWhatsAppBackfillAgentGroupsJob()
      .then((result) => {
        console.info("[cron/whatsapp/backfill-agent-groups] finished", result);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[cron/whatsapp/backfill-agent-groups] failed", msg, err);
      });

    return NextResponse.json({
      ok: true,
      started: true,
      message:
        "WhatsApp group backfill started in background. Check logs for per-master missingGroupTargets and spawn results.",
    });
  }

  const result = await runWhatsAppBackfillAgentGroupsJob();
  return NextResponse.json({ ok: true, ...result });
}
