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
import { createLogger } from "@/lib/observability/logger";
import { normalizeAffiliateId } from "@/lib/texas/sub-agents-direct-merge";

export type EnsureSyncReason =
  | "FRESH"
  | "NO_CREDENTIALS"
  | "SYNCED"
  | "SKIPPED_SUBSCRIPTION"
  | "SYNC_FAILED"
  | "MASTER_DERIVED";

export interface EnsureSyncResult {
  synced: boolean;
  reason: EnsureSyncReason;
  error?: string;
}

const log = createLogger("sync/child-ledger");

export function getLedgerStaleMs(): number {
  const minutes = Number(process.env.LEDGER_STALE_MINUTES ?? 15);
  return Math.max(1, minutes) * 60 * 1000;
}

export function getNetworkSyncMax(forceRefresh = false): number {
  const configured = Number(process.env.LEDGER_NETWORK_SYNC_MAX ?? 50);
  if (forceRefresh) {
    return Math.max(configured, Number(process.env.LEDGER_NETWORK_SYNC_FORCE_MAX ?? 200));
  }
  return Math.max(1, configured);
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

    log.info("child ledger synced via own credentials", {
      childUserId: userId,
      ledgerDate: date,
      al_nihai: result.report.al_nihai,
      strategy: "own_credentials",
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
    log.error("child ledger sync failed", { userId, error: msg });
    return { synced: false, reason: "SYNC_FAILED", error: msg };
  }
}

/**
 * Sync direct children via master's Texas session when child has no credentials.
 */
export async function syncDirectChildrenViaMasterSession(
  supabase: SupabaseClient,
  viewerUserId: string,
  ledgerDate: string,
  targetAffiliateIds?: string[]
): Promise<{ synced: number; attempted: number; failed: string[] }> {
  const creds = await requireUserCredentials(supabase, viewerUserId);
  const repository = new SupabaseAccountingRepository(supabase);
  const orchestrator = new DailyReportOrchestrator(repository, supabase);

  const result = await runStableRegisteredUserSync(
    orchestrator,
    viewerUserId,
    ledgerDate,
    creds.texas_affiliate_id,
    toTexasSyncRole(creds.role)
  );

  if ("skipped" in result && result.skipped) {
    return { synced: 0, attempted: 0, failed: [] };
  }

  if (!("sync" in result)) {
    return { synced: 0, attempted: 0, failed: [] };
  }

  const targetSet = targetAffiliateIds?.length
    ? new Set(targetAffiliateIds.map((id) => normalizeAffiliateId(id)).filter(Boolean) as string[])
    : null;

  const childSnapshots = (result.sync.childSnapshots ?? []).filter(
    (c: { affiliateId: string }) =>
      targetSet ? targetSet.has(normalizeAffiliateId(c.affiliateId) ?? "") : true
  );

  if (!childSnapshots.length) {
    log.warn("master session sync returned no child snapshots", {
      viewerUserId,
      ledgerDate,
      targetAffiliateIds,
    });
    return { synced: 0, attempted: 0, failed: [] };
  }

  const childResult = await orchestrator.syncChildrenFromMasterData(
    viewerUserId,
    ledgerDate,
    childSnapshots
  );

  log.info("direct children synced via master session", {
    viewerUserId,
    ledgerDate,
    attempted: childResult.attempted,
    synced: childResult.persisted,
    failed: childResult.failed,
    strategy: "master_derived",
  });

  return {
    synced: childResult.persisted,
    attempted: childResult.attempted,
    failed: childResult.failed,
  };
}

export interface RefreshDirectChildrenResult {
  attempted: number;
  syncedOwnCredentials: number;
  syncedMasterDerived: number;
  noCredentialsQueued: number;
  failed: number;
}

/**
 * Refresh stale/missing ledgers for direct children.
 * Uses own credentials when available; falls back to master session sync.
 */
export async function refreshDirectChildrenLedgers(
  supabase: SupabaseClient,
  viewerUserId: string,
  memberIds: string[],
  ledgerDate: string,
  options?: { force?: boolean }
): Promise<RefreshDirectChildrenResult> {
  const max = getNetworkSyncMax(Boolean(options?.force));
  const ids = memberIds.slice(0, max);

  let syncedOwnCredentials = 0;
  let noCredentialsQueued = 0;
  let failed = 0;
  const needsMasterAffiliateIds: string[] = [];

  for (const id of ids) {
    const stale = options?.force ? true : await isLedgerStale(supabase, id, ledgerDate);
    if (!stale) continue;

    const result = await ensureFreshLedgerForUser(supabase, id, ledgerDate, {
      force: options?.force,
    });

    if (result.synced) {
      syncedOwnCredentials += 1;
      continue;
    }

    if (result.reason === "NO_CREDENTIALS") {
      const { data: childRow } = await supabase
        .from("users")
        .select("texas_affiliate_id")
        .eq("id", id)
        .maybeSingle();
      const aid = normalizeAffiliateId(childRow?.texas_affiliate_id ?? "");
      if (aid) needsMasterAffiliateIds.push(aid);
      noCredentialsQueued += 1;
      continue;
    }

    if (result.reason === "SYNC_FAILED") failed += 1;
  }

  let syncedMasterDerived = 0;
  if (needsMasterAffiliateIds.length > 0) {
    try {
      const masterResult = await syncDirectChildrenViaMasterSession(
        supabase,
        viewerUserId,
        ledgerDate,
        needsMasterAffiliateIds
      );
      syncedMasterDerived = masterResult.synced;
      failed += masterResult.failed.length;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error("master session child sync failed", {
        viewerUserId,
        ledgerDate,
        error: msg,
      });
      failed += needsMasterAffiliateIds.length;
    }
  }

  return {
    attempted: ids.length,
    syncedOwnCredentials,
    syncedMasterDerived,
    noCredentialsQueued,
    failed,
  };
}

/** Refresh stale/missing ledgers for subtree members (master fallback when no child creds). */
export async function refreshStaleSubtreeLedgers(
  supabase: SupabaseClient,
  viewerUserId: string,
  memberIds: string[],
  ledgerDate: string,
  options?: { force?: boolean }
): Promise<{ attempted: number; synced: number }> {
  const result = await refreshDirectChildrenLedgers(
    supabase,
    viewerUserId,
    memberIds,
    ledgerDate,
    options
  );
  return {
    attempted: result.attempted,
    synced: result.syncedOwnCredentials + result.syncedMasterDerived,
  };
}
