import { createLogger } from "@/lib/observability/logger";
import { SupabaseAccountingRepository } from "@/lib/accounting/SupabaseAccountingRepository";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { resolveLedgerDate, REPORT_MODE_MONTHLY_MTD, sleep } from "@/lib/cron/ledger-date";
import { captureDailyReportImage } from "@/lib/report/report-screenshot";
import { formatLedgerDate } from "@/lib/utils/format";
import { sendWhatsAppImage } from "@/lib/whatsapp/client";
import { retryAsync } from "@/lib/utils/async-retry";
import { DailyReportOrchestrator } from "@/lib/services/DailyReportOrchestrator";
import { runStableRegisteredUserSync } from "@/lib/scraper/stable-scraper-wrapper";

const log = createLogger("cron/daily-agent-ledger");

type DispatchGroupRow = {
  user_id: string;
  affiliate_id: string;
  group_id: string;
  group_name: string | null;
};

const DISPATCH_RETRY_WINDOW_MS = 20 * 60 * 1000; // 20 minutes
const SEND_DELAY_MS = 1500;

export function shouldSkipDailyLedgerDispatch(params: {
  existingStatus: "in_progress" | "sent" | "failed" | null | undefined;
  lastAttemptAt: string | null | undefined;
  nowMs: number;
  retryWindowMs: number;
}): boolean {
  if (params.existingStatus === "sent") return true;

  if (params.lastAttemptAt) {
    const lastAttempt = new Date(params.lastAttemptAt).getTime();
    if (
      Number.isFinite(lastAttempt) &&
      params.nowMs - lastAttempt < params.retryWindowMs
    ) {
      return true;
    }
  }

  return false;
}

/** Refresh agent ledger via master's Texas session when the row is missing at dispatch time. */
export async function refreshAgentLedgerViaMaster(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  orchestrator: DailyReportOrchestrator,
  parentUserId: string,
  ledgerDate: string
): Promise<boolean> {
  const { data: master } = await supabase
    .from("users")
    .select("texas_affiliate_id")
    .eq("id", parentUserId)
    .maybeSingle();

  const result = await runStableRegisteredUserSync(
    orchestrator,
    parentUserId,
    ledgerDate,
    master?.texas_affiliate_id ?? null,
    "master"
  );

  if ("skipped" in result && result.skipped) return false;

  if ("sync" in result && result.sync.childSnapshots?.length > 0) {
    await orchestrator.syncChildrenFromMasterData(
      parentUserId,
      ledgerDate,
      result.sync.childSnapshots
    );
  }

  return true;
}

export async function runDailyAgentLedgerDispatchJob(): Promise<{
  ledgerDate: string;
  timezone: string;
  reportMode: string;
  totalGroups: number;
  attempted: number;
  sent: number;
  skippedDedup: number;
  failed: number;
}> {
  const ledgerDate = resolveLedgerDate();
  const reportMode = REPORT_MODE_MONTHLY_MTD;
  const timezone = process.env.LEDGER_TIMEZONE?.trim() || "Asia/Damascus";
  const supabase = getSupabaseServiceClient();
  const repository = new SupabaseAccountingRepository(supabase);
  const orchestrator = new DailyReportOrchestrator(repository, supabase);

  const { data: groups } = await supabase
    .from("whatsapp_agent_groups")
    .select("user_id,affiliate_id,group_id,group_name")
    .eq("is_active", true)
    .eq("created_by_bot", true)
    .ilike("group_name", "⚜️ %");

  const groupRows = (groups ?? []) as DispatchGroupRow[];
  const totalGroups = groupRows.length;

  let attempted = 0;
  let sent = 0;
  let skippedDedup = 0;
  let failed = 0;

  log.info("agent ledger dispatch start", {
    ledgerDate,
    reportMode,
    timezone,
    totalGroups,
  });

  if (totalGroups === 0) {
    log.warn(
      "no WhatsApp groups to dispatch: zero active bot groups (⚜️ prefix). Run group backfill or open Sub-Agents so missing groups are scheduled.",
      { ledgerDate, totalGroups }
    );
    return {
      ledgerDate,
      timezone,
      reportMode,
      totalGroups: 0,
      attempted: 0,
      sent: 0,
      skippedDedup: 0,
      failed: 0,
    };
  }

  for (let i = 0; i < groupRows.length; i++) {
    const g = groupRows[i]!;

    const groupId = g.group_id;
    const parentUserId = g.user_id;
    const affiliateId = g.affiliate_id;

    // Find the agent user under this parent.
    const { data: agent } = await supabase
      .from("users")
      .select("id")
      .eq("parent_id", parentUserId)
      .eq("texas_affiliate_id", affiliateId)
      .eq("is_active", true)
      .maybeSingle();

    if (!agent?.id) {
      log.warn("agent mapping missing (users row)", {
        ledgerDate,
        groupId,
        affiliateId,
        parentUserId,
      });
      continue;
    }

    let { data: ledgerRow } = await supabase
      .from("daily_ledgers")
      .select("id,status")
      .eq("user_id", agent.id)
      .eq("ledger_date", ledgerDate)
      .maybeSingle();

    if (!ledgerRow?.id) {
      log.warn("daily ledger row missing — refreshing via master sync", {
        ledgerDate,
        groupId,
        agentId: agent.id,
        parentUserId,
      });

      try {
        await refreshAgentLedgerViaMaster(
          supabase,
          orchestrator,
          parentUserId,
          ledgerDate
        );
      } catch (refreshErr) {
        const msg =
          refreshErr instanceof Error ? refreshErr.message : String(refreshErr);
        log.warn("master refresh failed before WhatsApp dispatch", {
          ledgerDate,
          groupId,
          agentId: agent.id,
          error: msg,
        });
        continue;
      }

      ({ data: ledgerRow } = await supabase
        .from("daily_ledgers")
        .select("id,status")
        .eq("user_id", agent.id)
        .eq("ledger_date", ledgerDate)
        .maybeSingle());
    }

    if (!ledgerRow?.id) {
      log.warn("daily ledger row still missing after master refresh", {
        ledgerDate,
        groupId,
        agentId: agent.id,
      });
      continue;
    }

    // Dedup + retry audit
    const { data: existing } = await supabase
      .from("whatsapp_ledger_dispatch_log")
      .select("id,status,last_attempt_at,attempt_count")
      .eq("group_id", groupId)
      .eq("ledger_date", ledgerDate)
      .maybeSingle();

    if (
      shouldSkipDailyLedgerDispatch({
        existingStatus: existing?.status,
        lastAttemptAt: existing?.last_attempt_at,
        nowMs: Date.now(),
        retryWindowMs: DISPATCH_RETRY_WINDOW_MS,
      })
    ) {
      skippedDedup += 1;
      continue;
    }

    attempted += 1;

    const nextAttemptCount =
      typeof existing?.attempt_count === "number"
        ? existing.attempt_count + 1
        : 1;

    // Mark in_progress (upsert)
    if (existing?.id) {
      const { error: updErr } = await supabase
        .from("whatsapp_ledger_dispatch_log")
        .update({
          status: "in_progress",
          attempt_count: nextAttemptCount,
          last_error: null,
          last_attempt_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (updErr) throw updErr;
    } else {
      const { error: insErr } = await supabase
        .from("whatsapp_ledger_dispatch_log")
        .insert({
          group_id: groupId,
          affiliate_id: affiliateId,
          ledger_date: ledgerDate,
          status: "in_progress",
          attempt_count: nextAttemptCount,
          last_attempt_at: new Date().toISOString(),
        });
      if (insErr) {
        // Could be a race with another dispatch worker.
        log.warn("dispatch log insert failed", {
          ledgerDate,
          groupId,
          error: insErr.message,
        });
        continue;
      }
    }

    try {
      const image = await retryAsync(
        () => captureDailyReportImage(ledgerRow.id, { mode: "monthly" }),
        {
          maxAttempts: 2,
          baseDelayMs: 1500,
          label: "daily-ledger-screenshot",
        }
      );

      const caption = `📊 تقرير تراكمي من أول الشهر حتى ${formatLedgerDate(ledgerDate)} · TEXAS FUNDS`;

      const sendResult = await retryAsync(
        () => sendWhatsAppImage(groupId, image, caption),
        {
          maxAttempts: 2,
          baseDelayMs: 1500,
          label: "daily-ledger-whatsapp-send",
        }
      );

      await supabase
        .from("whatsapp_ledger_dispatch_log")
        .update({
          status: "sent",
          message_id: sendResult.messageId,
          sent_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("group_id", groupId)
        .eq("ledger_date", ledgerDate);

      sent += 1;
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      try {
        await supabase
          .from("whatsapp_ledger_dispatch_log")
          .update({
            status: "failed",
            last_error: msg.slice(0, 1500),
            last_attempt_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("group_id", groupId)
          .eq("ledger_date", ledgerDate);
      } catch {
        // do not fail whole batch due to log update issues
      }

      log.error("agent ledger dispatch failed for group", {
        ledgerDate,
        groupId,
        affiliateId,
        error: msg,
      });
    }

    if (i < groupRows.length - 1) await sleep(SEND_DELAY_MS);
  }

  return {
    ledgerDate,
    timezone,
    reportMode,
    totalGroups,
    attempted,
    sent,
    skippedDedup,
    failed,
  };
}

