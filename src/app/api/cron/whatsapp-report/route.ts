/**
 * POST /api/cron/whatsapp-report
 * Triggered daily at 4:00 AM Damascus time (01:00 UTC).
 * Railway cron expression: 0 1 * * *
 *
 * For each connected WhatsApp instance:
 *  1. Authenticate with Texas API using instance owner's credentials
 *  2. Fetch sub-agent statistics + wallet balance
 *  3. Fetch today's cash payments from DB
 *  4. Generate report image (Puppeteer)
 *  5. Send image to all 🔥 groups
 */
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { CronAuthError, verifyCronSecret } from "@/lib/cron/auth";
import { getAllConnectedInstances } from "@/lib/whatsapp/instance-manager";
import { sendDailyReportToFireGroups } from "@/lib/whatsapp/report-sender";
import { getDayCashSummary } from "@/lib/whatsapp/cash-ledger";
import { TexasSessionService } from "@/lib/services/TexasSessionService";
import { requireUserCredentials } from "@/lib/scraper/resolve-user-credentials";
import { metricsFromTexasSources } from "@/lib/texas/texas-live-ledger";
import { fetchAllSubAgentStatistics } from "@/lib/texas/fetch-sub-agent-statistics";
import type { WhatsAppReportData } from "@/lib/whatsapp/render-whatsapp-report-html";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
export const maxDuration = 300;

function todayDamascus(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Damascus" });
}

export async function POST(request: Request) {
  try {
    verifyCronSecret(request);
  } catch (e) {
    if (e instanceof CronAuthError)
      return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }

  // Always return 202 immediately — this job takes minutes
  void runWhatsAppReportJob().catch((e) => {
    console.error("[cron/whatsapp-report] job failed", e instanceof Error ? e.message : String(e), e);
  });

  return Response.json({
    ok: true,
    started: true,
    message: "WhatsApp daily report job started in background",
  });
}

async function runWhatsAppReportJob(): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const ledgerDate = todayDamascus();

  console.info(`[cron/whatsapp-report] starting for date=${ledgerDate}`);

  const instances = await getAllConnectedInstances(supabase);
  if (!instances.length) {
    console.info("[cron/whatsapp-report] no connected instances — done");
    return;
  }

  console.info(`[cron/whatsapp-report] ${instances.length} connected instance(s)`);

  for (const instance of instances) {
    try {
      await processOneInstance(supabase, instance, ledgerDate);
    } catch (e) {
      console.error(
        `[cron/whatsapp-report] instance ${instance.instance_name} failed:`,
        e instanceof Error ? e.message : String(e)
      );
      // Continue with next instance
    }
  }

  console.info("[cron/whatsapp-report] all instances processed");
}

async function processOneInstance(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  instance: Awaited<ReturnType<typeof getAllConnectedInstances>>[number],
  ledgerDate: string
): Promise<void> {
  const { id: instanceId, instance_name: instanceName, user_id: userId } = instance;

  console.info(`[cron/whatsapp-report] processing instance=${instanceName} user=${userId}`);

  // 1. Get owner display name
  const { data: userRow } = await supabase
    .from("users")
    .select("display_name, texas_username")
    .eq("id", userId)
    .maybeSingle();
  const ownerName =
    userRow?.display_name ?? userRow?.texas_username ?? "Texas Funds";

  // 2. Authenticate with Texas API
  const creds = await requireUserCredentials(supabase, userId);
  if (!creds.hasCredentials) {
    console.warn(`[cron/whatsapp-report] no Texas credentials for user ${userId}`);
    return;
  }

  const session = new TexasSessionService();
  const token = await session.signIn({
    username: creds.username,
    password: creds.password,
  });
  const client = session.getClientFromToken(token);

  // 3. Fetch statistics (cumulative totals for this master)
  const { response: statsResponse } = await fetchAllSubAgentStatistics(client, {
    paginate: false, // totals row only needed
  });
  const totals = statsResponse.result?.total;

  // Extract cumulative totals from footer or first/only record
  const statsRecord = totals
    ? ({
        totalDeposit: totals.totalDeposit,
        totalWithdraw: totals.totalWithdraw,
        ngr: totals.ngr,
      } as Record<string, unknown>)
    : (statsResponse.result?.records?.[0] ?? null);

  const metrics = metricsFromTexasSources(
    statsRecord as Parameters<typeof metricsFromTexasSources>[0],
    null
  );

  // 4. Cash payments today
  const cash = await getDayCashSummary(supabase, userId, ledgerDate);

  // 5. Final balance = Texas balance + cashIn - cashOut
  const finalBalance = metrics.al_nihai + cash.cashIn - cash.cashOut;

  const reportData: WhatsAppReportData = {
    ownerName,
    ledgerDate,
    texasBalance: metrics.al_nihai,
    totalDeposit: metrics.tebat,
    totalWithdraw: metrics.suhoubat,
    ngr: metrics.al_harq,
    cashIn: cash.cashIn,
    cashOut: cash.cashOut,
    finalBalance,
    generatedAt: new Date().toISOString(),
  };

  // 6. Send to 🔥 groups (resync groups from Evolution API once per run)
  const result = await sendDailyReportToFireGroups(supabase, {
    instanceId,
    instanceName,
    userId,
    reportData,
    forceResync: true,
  });

  console.info(
    `[cron/whatsapp-report] instance=${instanceName} sent=${result.groupsSent.length} failed=${result.groupsFailed.length}`
  );
}
