import type { SupabaseClient } from "@supabase/supabase-js";
import { AccountingService } from "@/lib/accounting/AccountingService";
import {
  computeMtdLedgerMetricsForUser,
  type MtdLedgerMetricsResult,
} from "@/lib/accounting/mtd-ledger-metrics";
import {
  shouldSkipZeroPersistence,
  validateTexasDateFilterForAffiliate,
} from "@/lib/accounting/mtd-snapshot-validation";
import { resolveMonthStart } from "@/lib/accounting/monthly-ledger-view";
import { SupabaseAccountingRepository } from "@/lib/accounting/SupabaseAccountingRepository";
import {
  ensureFreshLedgerForUser,
} from "@/lib/scraper/ensure-user-ledger-sync";
import { resolveUserCredentials } from "@/lib/scraper/resolve-user-credentials";
import {
  buildTransferDateFilter,
  fetchAgentTransfers,
} from "@/lib/texas/fetch-agent-transfers";
import type { TexasHttpClient } from "@/lib/texas/texas-http-client";
import {
  normalizeAffiliateId,
  type DirectChildDbRow,
} from "@/lib/texas/sub-agents-direct-merge";
import type { NormalizedTexasSnapshot } from "@/lib/texas/types";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("sync/child-mtd-persistence");

const CUMULATIVE_FROM_DATE = "2000-01-01";

function previousCalendarDay(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export type MtdSourceLabel =
  | "mtd_snapshot"
  | "mtd_daily_rows"
  | "live_texas_fallback"
  | "empty_no_data"
  | "pending";

function classifyMtdSource(mtd: MtdLedgerMetricsResult): MtdSourceLabel {
  if (mtd.currentSnapshotFound && mtd.baselineSnapshotFound) {
    return "mtd_snapshot";
  }
  if (mtd.dailyRowsCount > 0 && !mtd.isEmptyFallback) {
    return "mtd_daily_rows";
  }
  if (mtd.isEmptyFallback) {
    return "empty_no_data";
  }
  return "mtd_snapshot";
}

export async function fetchAffiliateCumulativeTransferTotals(
  client: TexasHttpClient,
  affiliateId: string,
  throughDate: string
): Promise<{ totalDeposit: number; totalWithdraw: number; recordCount: number }> {
  const id = affiliateId.trim();
  const result = await fetchAgentTransfers(client, {
    affiliateId: id,
    paginate: true,
    extraFilter: buildTransferDateFilter(CUMULATIVE_FROM_DATE, throughDate),
  });
  return {
    totalDeposit: result.totals.totalDeposit,
    totalWithdraw: result.totals.totalWithdraw,
    recordCount: result.records.length,
  };
}

async function hasSnapshotOnOrBefore(
  supabase: SupabaseClient,
  userId: string,
  onOrBeforeDate: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("api_snapshots")
    .select("id")
    .eq("user_id", userId)
    .lte("ledger_date", onOrBeforeDate)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function hasSnapshotForDate(
  supabase: SupabaseClient,
  userId: string,
  ledgerDate: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("api_snapshots")
    .select("id")
    .eq("user_id", userId)
    .eq("ledger_date", ledgerDate)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

export async function childNeedsPersistence(
  supabase: SupabaseClient,
  userId: string,
  ledgerDate: string,
  force: boolean
): Promise<{ needed: boolean; reasons: string[] }> {
  if (force) {
    return { needed: true, reasons: ["force_refresh"] };
  }

  const reasons: string[] = [];
  const monthStart = resolveMonthStart(ledgerDate);
  const dayBeforeMonth = previousCalendarDay(monthStart);

  const hasCurrent = await hasSnapshotForDate(supabase, userId, ledgerDate);
  if (!hasCurrent) reasons.push("missing_api_snapshot");

  const hasBaseline = await hasSnapshotOnOrBefore(
    supabase,
    userId,
    dayBeforeMonth
  );
  if (!hasBaseline) reasons.push("missing_baseline_snapshot");

  const { data: ledger } = await supabase
    .from("daily_ledgers")
    .select("id")
    .eq("user_id", userId)
    .eq("ledger_date", ledgerDate)
    .maybeSingle();
  if (!ledger?.id) reasons.push("missing_daily_ledger");

  return { needed: reasons.length > 0, reasons };
}

async function ensureBaselineSnapshot(
  supabase: SupabaseClient,
  repository: SupabaseAccountingRepository,
  userId: string,
  affiliateId: string,
  dayBeforeMonth: string,
  totalsThroughBaseline: { totalDeposit: number; totalWithdraw: number },
  liveTotals: { totalDeposit: number; totalWithdraw: number }
): Promise<boolean> {
  const skip = shouldSkipZeroPersistence(totalsThroughBaseline, liveTotals);
  if (skip.skip) {
    log.warn("[sync:child-ledger] skip baseline zero overwrite", {
      affiliateId,
      dayBeforeMonth,
      reason: skip.reason,
      baselineDeposit: totalsThroughBaseline.totalDeposit,
      baselineWithdraw: totalsThroughBaseline.totalWithdraw,
      liveDeposit: liveTotals.totalDeposit,
      liveWithdraw: liveTotals.totalWithdraw,
    });
    return false;
  }

  const has = await hasSnapshotOnOrBefore(supabase, userId, dayBeforeMonth);
  if (has) return false;

  const baselineSnap: NormalizedTexasSnapshot = {
    balance: 0,
    totalDeposit: totalsThroughBaseline.totalDeposit,
    totalWithdraw: totalsThroughBaseline.totalWithdraw,
    ngr: 0,
    currencyCode: "NSP",
    rawWallets: {},
    rawStatistics: {
      source: "master_derived_baseline",
      affiliateId,
      throughDate: dayBeforeMonth,
    },
  };

  await repository.insertSnapshot(
    userId,
    dayBeforeMonth,
    baselineSnap,
    "master_derived_baseline"
  );
  return true;
}

export async function persistChildMtdFromTexasClient(
  supabase: SupabaseClient,
  childUserId: string,
  affiliateId: string,
  ledgerDate: string,
  client: TexasHttpClient,
  liveTotals: { totalDeposit: number; totalWithdraw: number }
): Promise<{
  snapshotCreated: boolean;
  baselineSnapshotCreated: boolean;
  ledgerUpserted: boolean;
  skipped: boolean;
  skipReason?: string;
  totalDeposit: number;
  totalWithdraw: number;
  tebat: number;
  suhoubat: number;
  mtdSourceAfterRefresh: MtdSourceLabel;
}> {
  const aid = normalizeAffiliateId(affiliateId);
  if (!aid) {
    throw new Error("missing affiliate id for child persistence");
  }

  const monthStart = resolveMonthStart(ledgerDate);
  const dayBeforeMonth = previousCalendarDay(monthStart);

  const dateValidation = await validateTexasDateFilterForAffiliate(
    client,
    aid,
    ledgerDate,
    liveTotals
  );

  if (!dateValidation.dateFilterTrusted) {
    log.warn("[sync:child-ledger] skip persist — date filters not trusted", {
      childUserId,
      affiliateId: aid,
      reasons: dateValidation.reasons,
      liveDeposit: liveTotals.totalDeposit,
      liveWithdraw: liveTotals.totalWithdraw,
    });
    const mtd = await computeMtdLedgerMetricsForUser(
      supabase,
      childUserId,
      ledgerDate
    );
    return {
      snapshotCreated: false,
      baselineSnapshotCreated: false,
      ledgerUpserted: false,
      skipped: true,
      skipReason: "date_filter_untrusted",
      totalDeposit: 0,
      totalWithdraw: 0,
      tebat: 0,
      suhoubat: 0,
      mtdSourceAfterRefresh: classifyMtdSource(mtd),
    };
  }

  const totalsCurrent = {
    totalDeposit: dateValidation.noDateDeposit,
    totalWithdraw: dateValidation.noDateWithdraw,
    recordCount: dateValidation.noDateRecordCount,
  };
  const totalsBaseline = {
    totalDeposit: dateValidation.baselineDeposit,
    totalWithdraw: dateValidation.baselineWithdraw,
    recordCount: dateValidation.baselineRecordCount,
  };

  const skipCurrent = shouldSkipZeroPersistence(totalsCurrent, liveTotals);
  if (skipCurrent.skip) {
    log.warn("[sync:child-ledger] skip persist — would write zero snapshot", {
      childUserId,
      affiliateId: aid,
      reason: skipCurrent.reason,
      liveDeposit: liveTotals.totalDeposit,
      liveWithdraw: liveTotals.totalWithdraw,
    });
    const mtd = await computeMtdLedgerMetricsForUser(
      supabase,
      childUserId,
      ledgerDate
    );
    return {
      snapshotCreated: false,
      baselineSnapshotCreated: false,
      ledgerUpserted: false,
      skipped: true,
      skipReason: skipCurrent.reason,
      totalDeposit: 0,
      totalWithdraw: 0,
      tebat: 0,
      suhoubat: 0,
      mtdSourceAfterRefresh: classifyMtdSource(mtd),
    };
  }

  const repository = new SupabaseAccountingRepository(supabase);
  const accounting = new AccountingService(repository);

  const baselineSnapshotCreated = await ensureBaselineSnapshot(
    supabase,
    repository,
    childUserId,
    aid,
    dayBeforeMonth,
    totalsBaseline,
    liveTotals
  );

  const currentSnap: NormalizedTexasSnapshot = {
    balance: 0,
    totalDeposit: totalsCurrent.totalDeposit,
    totalWithdraw: totalsCurrent.totalWithdraw,
    ngr: 0,
    currencyCode: "NSP",
    rawWallets: {},
    rawStatistics: {
      source: "master_derived",
      affiliateId: aid,
      throughDate: ledgerDate,
      transferRecords: totalsCurrent.recordCount,
      dateFilterTrusted: true,
    },
  };

  const snapshotInsert = await repository.insertSnapshot(
    childUserId,
    ledgerDate,
    currentSnap,
    "master_derived"
  );

  const report = await accounting.syncAndPersistDailyReport(
    childUserId,
    ledgerDate,
    currentSnap,
    { closingSnapshotId: snapshotInsert.id }
  );

  const mtd = await computeMtdLedgerMetricsForUser(
    supabase,
    childUserId,
    ledgerDate
  );
  const mtdSourceAfterRefresh = classifyMtdSource(mtd);

  log.info("[sync:child-ledger]", {
    childUserId,
    affiliateId: aid,
    snapshotCreated: true,
    baselineSnapshotCreated,
    ledgerUpserted: true,
    totalDeposit: totalsCurrent.totalDeposit,
    totalWithdraw: totalsCurrent.totalWithdraw,
    tebat: report.tebat,
    suhoubat: report.suhoubat,
    mtdSourceAfterRefresh,
    baselineDeposit: totalsBaseline.totalDeposit,
    baselineWithdraw: totalsBaseline.totalWithdraw,
    mtdTexasStrategy: mtd.texasStrategy,
    baselineSnapshotFound: mtd.baselineSnapshotFound,
    currentSnapshotFound: mtd.currentSnapshotFound,
    dateFilterTrusted: true,
  });

  return {
    snapshotCreated: true,
    baselineSnapshotCreated,
    ledgerUpserted: true,
    skipped: false,
    totalDeposit: totalsCurrent.totalDeposit,
    totalWithdraw: totalsCurrent.totalWithdraw,
    tebat: report.tebat,
    suhoubat: report.suhoubat,
    mtdSourceAfterRefresh,
  };
}

export interface PersistDirectChildrenResult {
  attempted: number;
  persistedOwnCredentials: number;
  persistedMasterDerived: number;
  skippedFresh: number;
  skippedUntrustedDateFilter: number;
  preventedZeroOverwrite: number;
  failed: number;
  perChild: Array<{
    childUserId: string;
    affiliateId: string;
    strategy: string;
    mtdSourceAfterRefresh?: MtdSourceLabel;
    error?: string;
    skipReason?: string;
  }>;
}

/**
 * Ensure each direct child has api_snapshot + baseline + daily_ledger when Texas date filters are trusted.
 * Never persists zero snapshots when live Texas has non-zero transfer totals.
 */
export async function persistDirectChildrenMtd(
  supabase: SupabaseClient,
  viewerUserId: string,
  children: DirectChildDbRow[],
  ledgerDate: string,
  client: TexasHttpClient,
  options?: {
    force?: boolean;
    liveTotalsByAffiliateId?: Map<string, { totalDeposit: number; totalWithdraw: number }>;
  }
): Promise<PersistDirectChildrenResult> {
  const force = Boolean(options?.force);
  const liveByAffiliate = options?.liveTotalsByAffiliateId ?? new Map();
  const result: PersistDirectChildrenResult = {
    attempted: children.length,
    persistedOwnCredentials: 0,
    persistedMasterDerived: 0,
    skippedFresh: 0,
    skippedUntrustedDateFilter: 0,
    preventedZeroOverwrite: 0,
    failed: 0,
    perChild: [],
  };

  for (const child of children) {
    const childUserId = child.id;
    const affiliateId = normalizeAffiliateId(child.texas_affiliate_id ?? "");
    if (!affiliateId) {
      result.failed += 1;
      result.perChild.push({
        childUserId,
        affiliateId: "",
        strategy: "skip",
        error: "missing_affiliate_id",
      });
      continue;
    }

    const liveTotals = liveByAffiliate.get(affiliateId) ?? {
      totalDeposit: 0,
      totalWithdraw: 0,
    };

    const { needed, reasons } = await childNeedsPersistence(
      supabase,
      childUserId,
      ledgerDate,
      force
    );

    if (!needed) {
      result.skippedFresh += 1;
      const mtd = await computeMtdLedgerMetricsForUser(
        supabase,
        childUserId,
        ledgerDate
      );
      result.perChild.push({
        childUserId,
        affiliateId,
        strategy: "already_persisted",
        mtdSourceAfterRefresh: classifyMtdSource(mtd),
      });
      continue;
    }

    let hasOwnCreds = false;
    try {
      const creds = await resolveUserCredentials(supabase, childUserId);
      hasOwnCreds = creds.hasCredentials;
    } catch {
      hasOwnCreds = false;
    }

    if (hasOwnCreds) {
      const own = await ensureFreshLedgerForUser(supabase, childUserId, ledgerDate, {
        force,
      });
      if (own.synced) {
        result.persistedOwnCredentials += 1;
        const mtd = await computeMtdLedgerMetricsForUser(
          supabase,
          childUserId,
          ledgerDate
        );
        const mtdSource = classifyMtdSource(mtd);
        log.info("[sync:child-ledger]", {
          childUserId,
          affiliateId,
          strategy: "own_credentials",
          mtdSourceAfterRefresh: mtdSource,
          reasons,
        });
        result.perChild.push({
          childUserId,
          affiliateId,
          strategy: "own_credentials",
          mtdSourceAfterRefresh: mtdSource,
        });
        continue;
      }
    }

    try {
      const persisted = await persistChildMtdFromTexasClient(
        supabase,
        childUserId,
        affiliateId,
        ledgerDate,
        client,
        liveTotals
      );
      if (persisted.skipped) {
        if (persisted.skipReason === "date_filter_untrusted") {
          result.skippedUntrustedDateFilter += 1;
        } else {
          result.preventedZeroOverwrite += 1;
        }
        result.perChild.push({
          childUserId,
          affiliateId,
          strategy: "skipped_untrusted",
          mtdSourceAfterRefresh: persisted.mtdSourceAfterRefresh,
          skipReason: persisted.skipReason,
        });
        continue;
      }
      result.persistedMasterDerived += 1;
      result.perChild.push({
        childUserId,
        affiliateId,
        strategy: "master_derived",
        mtdSourceAfterRefresh: persisted.mtdSourceAfterRefresh,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.failed += 1;
      log.error("child MTD persistence failed", {
        childUserId,
        affiliateId,
        reasons,
        error: msg,
      });
      result.perChild.push({
        childUserId,
        affiliateId,
        strategy: "failed",
        error: msg,
      });
    }
  }

  log.info("direct children MTD persistence batch complete", {
    viewerUserId,
    ledgerDate,
    force,
    ...result,
    perChild: result.perChild.map((c) => ({
      affiliateId: c.affiliateId,
      strategy: c.strategy,
      mtd: c.mtdSourceAfterRefresh,
      error: c.error,
      skipReason: c.skipReason,
    })),
  });

  return result;
}
