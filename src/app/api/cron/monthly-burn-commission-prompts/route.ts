import { NextResponse } from "next/server";
import { CronAuthError, verifyCronSecret } from "@/lib/cron/auth";
import { runMonthlyBurnCommissionPromptsJob } from "@/lib/cron/monthly-burn-commission-prompts-job";

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

  const result = await runMonthlyBurnCommissionPromptsJob();
  return NextResponse.json({ ok: true, ...result });
}
