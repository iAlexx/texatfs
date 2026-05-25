import { SupabaseAccountingRepository } from "@/lib/accounting/SupabaseAccountingRepository";
import { fetchActiveCronSubscribers } from "@/lib/cron/active-users";
import { resolveLedgerDate, sleep } from "@/lib/cron/ledger-date";
import { loadReportRenderData } from "@/lib/report/load-report-data";
import { dispatchDailySummaryPhoto } from "@/lib/report/daily-summary-dispatcher";
import { DailyReportOrchestrator } from "@/lib/services/DailyReportOrchestrator";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { recordSyncLog } from "@/lib/finance/sync-log";
import { upsertDailyMetric } from "@/lib/finance/cumulative-vault";
import { checkAndSendSmartAlerts } from "@/lib/finance/smart-alerts";
import {
  runStableRegisteredUserSync,
  ScraperCircuitOpenError,
} from "@/lib/scraper/stable-scraper-wrapper";
import { createLogger } from "@/lib/observability/logger";

const cronLog = createLogger("cron/daily-sync");

const USER_DELAY_MS = Number(process.env.CRON_USER_DELAY_MS ?? 60_000);

export interface DailySyncJobResult {
  ledgerDate: string;
  startedAt: string;
  finishedAt: string;
  total: number;
  synced: number;
  skipped: number;
  photosSent: number;
  childrenSynced: number;
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
  let childrenSynced = 0;
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

      const result = await runStableRegisteredUserSync(
        orchestrator,
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

      // Sync per-child ledgers from the Master's statistics data
      if ("sync" in result && result.sync.childSnapshots?.length > 0) {
        try {
          const childResult = await orchestrator.syncChildrenFromMasterData(
            user.id,
            ledgerDate,
            result.sync.childSnapshots
          );
          childrenSynced += childResult.persisted;

          cronLog.info("children synced for master", {
            masterUserId: user.id,
            attempted: childResult.attempted,
            persisted: childResult.persisted,
            created: childResult.created,
            failedAffiliates: childResult.failed,
          });
        } catch (childErr) {
          const childMsg = childErr instanceof Error ? childErr.message : String(childErr);
          cronLog.warn("children sync failed for master", {
            masterUserId: user.id,
            error: childMsg,
          });
        }
      }

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

      const { data: ledgerFull } = await supabase
        .from("daily_ledgers")
        .select("al_nihai, al_harq, suhoubat, tebat")
        .eq("id", ledgerRow.id)
        .single();

      if (ledgerFull) {
        const { data: prev } = await supabase
          .from("daily_ledgers")
          .select("al_nihai")
          .eq("user_id", user.id)
          .lt("ledger_date", ledgerDate)
          .order("ledger_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        await upsertDailyMetric(
          supabase,
          user.id,
          ledgerDate,
          Number(ledgerFull.al_nihai),
          prev ? Number(prev.al_nihai) : null
        );

        await checkAndSendSmartAlerts(
          supabase,
          user.id,
          user.telegram_id,
          {
            al_harq: Number(ledgerFull.al_harq),
            al_nihai: Number(ledgerFull.al_nihai),
            suhoubat: Number(ledgerFull.suhoubat),
            tebat: Number(ledgerFull.tebat),
          },
          user.subscription_end_date
        );
      }

      await recordSyncLog(supabase, {
        userId: user.id,
        status: "success",
        ledgerDate,
      });

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
      await recordSyncLog(supabase, {
        userId: user.id,
        status: "failed",
        errorMessage: msg,
        ledgerDate,
      });
      failed.push({ userId: user.id, error: msg });

      if (e instanceof ScraperCircuitOpenError) {
        console.error("[cron/daily-sync] circuit open — stopping job", {
          error: msg,
        });
        break;
      }
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
    childrenSynced,
    failed,
  };
}
