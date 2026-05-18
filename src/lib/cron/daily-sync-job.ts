import { SupabaseAccountingRepository } from "@/lib/accounting/SupabaseAccountingRepository";
import { fetchActiveCronSubscribers } from "@/lib/cron/active-users";
import { resolveLedgerDate, sleep } from "@/lib/cron/ledger-date";
import { loadReportRenderData } from "@/lib/report/load-report-data";
import { dispatchDailySummaryPhoto } from "@/lib/report/daily-summary-dispatcher";
import { DailyReportOrchestrator } from "@/lib/services/DailyReportOrchestrator";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

const USER_DELAY_MS = Number(process.env.CRON_USER_DELAY_MS ?? 60_000);

export interface DailySyncJobResult {
  ledgerDate: string;
  startedAt: string;
  finishedAt: string;
  total: number;
  synced: number;
  skipped: number;
  photosSent: number;
  failed: Array<{ userId: string; error: string }>;
}

export async function runDailySyncJob(): Promise<DailySyncJobResult> {
  const startedAt = new Date().toISOString();
  const ledgerDate = resolveLedgerDate();
  const supabase = getSupabaseServiceClient();
  const repository = new SupabaseAccountingRepository(supabase);
  const orchestrator = new DailyReportOrchestrator(repository, supabase);

  const subscribers = await fetchActiveCronSubscribers(supabase);

  let synced = 0;
  let skipped = 0;
  let photosSent = 0;
  const failed: DailySyncJobResult["failed"] = [];

  for (let i = 0; i < subscribers.length; i++) {
    const user = subscribers[i]!;

    if (i > 0) {
      console.info("[cron/daily-sync] waiting before next user", {
        delayMs: USER_DELAY_MS,
        index: i,
        total: subscribers.length,
      });
      await sleep(USER_DELAY_MS);
    }

    try {
      console.info("[cron/daily-sync] processing user", {
        userId: user.id,
        telegramId: user.telegram_id,
        ledgerDate,
      });

      const result = await orchestrator.runForRegisteredUser(
        user.id,
        ledgerDate,
        user.texas_affiliate_id,
        "master"
      );

      if ("skipped" in result && result.skipped) {
        skipped += 1;
        continue;
      }

      synced += 1;

      const { data: ledgerRow, error: ledgerError } = await supabase
        .from("daily_ledgers")
        .select("id")
        .eq("user_id", user.id)
        .eq("ledger_date", ledgerDate)
        .maybeSingle();

      if (ledgerError) throw ledgerError;
      if (!ledgerRow?.id) {
        throw new Error("Ledger row missing after sync");
      }

      const renderData = await loadReportRenderData(supabase, ledgerRow.id);
      if (!renderData) {
        throw new Error("Report render data missing");
      }

      await dispatchDailySummaryPhoto(
        user.telegram_id,
        ledgerRow.id,
        renderData
      );
      photosSent += 1;

      console.info("[cron/daily-sync] user complete", {
        userId: user.id,
        ledgerId: ledgerRow.id,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[cron/daily-sync] user failed", {
        userId: user.id,
        error: msg,
      });
      failed.push({ userId: user.id, error: msg });
    }
  }

  return {
    ledgerDate,
    startedAt,
    finishedAt: new Date().toISOString(),
    total: subscribers.length,
    synced,
    skipped,
    photosSent,
    failed,
  };
}
