import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseAccountingRepository } from "@/lib/accounting/SupabaseAccountingRepository";
import { recordSyncLog } from "@/lib/finance/sync-log";
import { resolveLedgerDate } from "@/lib/cron/ledger-date";
import { DailyReportOrchestrator } from "@/lib/services/DailyReportOrchestrator";
import {
  requireUserCredentials,
  toTexasSyncRole,
} from "@/lib/scraper/resolve-user-credentials";
import { runStableRegisteredUserSync } from "@/lib/scraper/stable-scraper-wrapper";

export type EnsureSyncReason =
  | "FRESH"
  | "NO_CREDENTIALS"
  | "SYNCED"
  | "SKIPPED_SUBSCRIPTION"
  | "SYNC_FAILED";

export interface EnsureSyncResult {
  synced: boolean;
  reason: EnsureSyncReason;
  error?: string;
}

export function getLedgerStaleMs(): number {
  const minutes = Number(process.env.LEDGER_STALE_MINUTES ?? 15);
  return Math.max(1, minutes) * 60 * 1000;
}

export async function isLedgerStale(
  supabase: SupabaseClient,
  userId: string,
  ledgerDate: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("daily_ledgers")
    .select("updated_at")
    .eq("user_id", userId)
    .eq("ledger_date", ledgerDate)
    .maybeSingle();

  if (error) throw error;
  if (!data?.updated_at) return true;

  const age = Date.now() - new Date(data.updated_at).getTime();
  return age > getLedgerStaleMs();
}

/**
 * Sync one tenant's Texas data into daily_ledgers using their own credentials.
 */
export async function ensureFreshLedgerForUser(
  supabase: SupabaseClient,
  userId: string,
  ledgerDate?: string,
  options?: { force?: boolean }
): Promise<EnsureSyncResult> {
  const date = ledgerDate ?? resolveLedgerDate();

  const { data: lockedRow } = await supabase
    .from("daily_ledgers")
    .select("id, is_locked, status")
    .eq("user_id", userId)
    .eq("ledger_date", date)
    .maybeSingle();

  if (lockedRow?.is_locked || lockedRow?.status === "closed") {
    return { synced: false, reason: "FRESH" };
  }

  const started = Date.now();

  let creds;
  try {
    creds = await requireUserCredentials(supabase, userId);
  } catch (e) {
    return {
      synced: false,
      reason: "NO_CREDENTIALS",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const stale = await isLedgerStale(supabase, userId, date);
  if (!stale && !options?.force) {
    return { synced: false, reason: "FRESH" };
  }

  const repository = new SupabaseAccountingRepository(supabase);
  const orchestrator = new DailyReportOrchestrator(repository, supabase);

  try {
    const result = await runStableRegisteredUserSync(
      orchestrator,
      userId,
      date,
      creds.texas_affiliate_id,
      toTexasSyncRole(creds.role)
    );

    if ("skipped" in result) {
      await recordSyncLog(supabase, {
        userId,
        status: "failed",
        errorMessage: "subscription inactive",
        ledgerDate: date,
        durationMs: Date.now() - started,
      });
      return { synced: false, reason: "SKIPPED_SUBSCRIPTION" };
    }

    await recordSyncLog(supabase, {
      userId,
      status: "success",
      ledgerDate: date,
      durationMs: Date.now() - started,
    });

    console.info("[ensure-user-ledger-sync] synced", {
      userId,
      ledgerDate: date,
      al_nihai: result.report.al_nihai,
      texasLogin: creds.username.slice(0, 3) + "***",
    });

    return { synced: true, reason: "SYNCED" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordSyncLog(supabase, {
      userId,
      status: "failed",
      errorMessage: msg,
      ledgerDate: date,
      durationMs: Date.now() - started,
    });
    console.error("[ensure-user-ledger-sync] failed", { userId, error: msg });
    return { synced: false, reason: "SYNC_FAILED", error: msg };
  }
}

const NETWORK_SYNC_MAX = Number(process.env.LEDGER_NETWORK_SYNC_MAX ?? 8);

/**
 * Refresh stale/missing ledgers for subtree members (bounded concurrency).
 */
export async function refreshStaleSubtreeLedgers(
  supabase: SupabaseClient,
  memberIds: string[],
  ledgerDate: string
): Promise<{ attempted: number; synced: number }> {
  const ids = memberIds.slice(0, NETWORK_SYNC_MAX);
  let synced = 0;

  for (const id of ids) {
    const stale = await isLedgerStale(supabase, id, ledgerDate);
    if (!stale) continue;

    const result = await ensureFreshLedgerForUser(supabase, id, ledgerDate);
    if (result.synced) synced += 1;
  }

  return { attempted: ids.length, synced };
}
