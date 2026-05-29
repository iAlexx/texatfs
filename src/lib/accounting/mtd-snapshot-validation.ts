import {
  computeAlFarq,
  computeAlHarqFromAlFarq,
  computeAlNihai,
  roundMoney,
} from "@/lib/accounting/formulas";
import type { MtdLedgerMetricsResult } from "@/lib/accounting/mtd-ledger-metrics";
import { resolveMonthStart } from "@/lib/accounting/monthly-ledger-view";
import {
  buildTransferDateFilter,
  fetchAgentTransfers,
} from "@/lib/texas/fetch-agent-transfers";
import type { TexasHttpClient } from "@/lib/texas/texas-http-client";
import type { TexasSubAgentRow } from "@/lib/texas/texas-live-sub-agents";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("accounting/mtd-validation");

export interface LiveTransferTotals {
  totalDeposit: number;
  totalWithdraw: number;
}

export interface DateFilterValidationResult {
  affiliateId: string;
  noDateRecordCount: number;
  currentRecordCount: number;
  baselineRecordCount: number;
  monthRangeRecordCount: number;
  noDateDeposit: number;
  noDateWithdraw: number;
  currentDeposit: number;
  currentWithdraw: number;
  baselineDeposit: number;
  baselineWithdraw: number;
  monthRangeDeposit: number;
  monthRangeWithdraw: number;
  dateFilterTrusted: boolean;
  reasons: string[];
}

function previousCalendarDay(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function liveTotalsFromAgent(agent: TexasSubAgentRow): LiveTransferTotals {
  return {
    totalDeposit: roundMoney(agent.metrics.tebat),
    totalWithdraw: roundMoney(agent.metrics.suhoubat),
  };
}

export function liveTotalsHaveMoney(totals: LiveTransferTotals): boolean {
  return totals.totalDeposit !== 0 || totals.totalWithdraw !== 0;
}

export function mtdTransferTotalsZero(mtd: MtdLedgerMetricsResult): boolean {
  return mtd.tebatMtd === 0 && mtd.suhoubatMtd === 0;
}

/**
 * Snapshot MTD is valid for display only when it is not zero while live Texas has money.
 */
export function isValidMtdSnapshotForDisplay(
  mtd: MtdLedgerMetricsResult,
  live: LiveTransferTotals
): { valid: boolean; reason: string } {
  if (!mtd.currentSnapshotFound || !mtd.baselineSnapshotFound) {
    return { valid: false, reason: "missing_snapshots" };
  }

  const liveHas = liveTotalsHaveMoney(live);
  const mtdZero = mtdTransferTotalsZero(mtd);

  if (mtdZero && liveHas) {
    return { valid: false, reason: "mtd_zero_live_nonempty" };
  }

  if (!mtdZero) {
    return { valid: true, reason: "mtd_has_values" };
  }

  if (!liveHas) {
    return { valid: true, reason: "all_zero" };
  }

  return { valid: false, reason: "mtd_zero_live_nonempty" };
}

export function isValidMtdDailyRowsForDisplay(
  mtd: MtdLedgerMetricsResult,
  live: LiveTransferTotals
): { valid: boolean; reason: string } {
  if (mtd.dailyRowsCount <= 0 || mtd.isEmptyFallback) {
    return { valid: false, reason: "no_daily_rows" };
  }
  if (mtdTransferTotalsZero(mtd) && liveTotalsHaveMoney(live)) {
    return { valid: false, reason: "daily_rows_zero_live_nonempty" };
  }
  return { valid: true, reason: "daily_rows_ok" };
}

export function metricsFromLiveTotals(
  live: LiveTransferTotals,
  waselMenho = 0,
  waselEleih = 0,
  baqiQadim = 0
): {
  tebat: number;
  suhoubat: number;
  al_farq: number;
  al_harq: number;
  al_nihai: number;
} {
  const al_farq = computeAlFarq(live.totalDeposit, live.totalWithdraw);
  const al_harq = computeAlHarqFromAlFarq(al_farq);
  const al_nihai = computeAlNihai({
    al_farq,
    wasel_menho: waselMenho,
    wasel_eleih: waselEleih,
    baqi_qadim: baqiQadim,
  });
  return {
    tebat: live.totalDeposit,
    suhoubat: live.totalWithdraw,
    al_farq,
    al_harq,
    al_nihai,
  };
}

/** mohammad55 regression: 2.5M deposit, 11.1M withdraw → -8.6M farq */
export function assertMohammadStyleMath(
  deposit: number,
  withdraw: number
): { al_farq: number; al_harq: number } {
  const al_farq = computeAlFarq(deposit, withdraw);
  const al_harq = computeAlHarqFromAlFarq(al_farq);
  return { al_farq, al_harq };
}

export function shouldSkipZeroPersistence(
  fetched: LiveTransferTotals,
  live: LiveTransferTotals
): { skip: boolean; reason: string } {
  const fetchedZero =
    fetched.totalDeposit === 0 && fetched.totalWithdraw === 0;
  const liveHas = liveTotalsHaveMoney(live);
  if (fetchedZero && liveHas) {
    return { skip: true, reason: "prevent_zero_overwrite_live_has_data" };
  }
  return { skip: false, reason: "ok_to_persist" };
}

export async function validateTexasDateFilterForAffiliate(
  client: TexasHttpClient,
  affiliateId: string,
  ledgerDate: string,
  liveTotals: LiveTransferTotals
): Promise<DateFilterValidationResult> {
  const id = affiliateId.trim();
  const monthStart = resolveMonthStart(ledgerDate);
  const dayBeforeMonth = previousCalendarDay(monthStart);

  const [noDate, current, baseline, monthRange] = await Promise.all([
    fetchAgentTransfers(client, { affiliateId: id, paginate: true }),
    fetchAgentTransfers(client, {
      affiliateId: id,
      paginate: true,
      extraFilter: buildTransferDateFilter("2000-01-01", ledgerDate),
    }),
    fetchAgentTransfers(client, {
      affiliateId: id,
      paginate: true,
      extraFilter: buildTransferDateFilter("2000-01-01", dayBeforeMonth),
    }),
    fetchAgentTransfers(client, {
      affiliateId: id,
      paginate: true,
      extraFilter: buildTransferDateFilter(monthStart, ledgerDate),
    }),
  ]);

  const result: DateFilterValidationResult = {
    affiliateId: id,
    noDateRecordCount: noDate.records.length,
    currentRecordCount: current.records.length,
    baselineRecordCount: baseline.records.length,
    monthRangeRecordCount: monthRange.records.length,
    noDateDeposit: noDate.totals.totalDeposit,
    noDateWithdraw: noDate.totals.totalWithdraw,
    currentDeposit: current.totals.totalDeposit,
    currentWithdraw: current.totals.totalWithdraw,
    baselineDeposit: baseline.totals.totalDeposit,
    baselineWithdraw: baseline.totals.totalWithdraw,
    monthRangeDeposit: monthRange.totals.totalDeposit,
    monthRangeWithdraw: monthRange.totals.totalWithdraw,
    dateFilterTrusted: true,
    reasons: [],
  };

  const liveHas = liveTotalsHaveMoney(liveTotals);
  const noDateHas = liveTotalsHaveMoney({
    totalDeposit: noDate.totals.totalDeposit,
    totalWithdraw: noDate.totals.totalWithdraw,
  });

  if (liveHas && !noDateHas) {
    result.dateFilterTrusted = false;
    result.reasons.push("no_date_fetch_empty_but_live_has_data");
  }

  if (
    liveHas &&
    result.currentDeposit === 0 &&
    result.currentWithdraw === 0 &&
    noDateHas
  ) {
    result.dateFilterTrusted = false;
    result.reasons.push("through_ledger_date_filter_zero");
  }

  if (
    liveHas &&
    result.baselineDeposit === 0 &&
    result.baselineWithdraw === 0 &&
    result.monthRangeRecordCount > 0
  ) {
    // month range works but cumulative-through-date filters do not — trust month range only
    result.reasons.push("baseline_date_filter_zero_month_range_ok");
  } else if (
    liveHas &&
    result.baselineDeposit === 0 &&
    result.baselineWithdraw === 0 &&
    noDateHas
  ) {
    result.dateFilterTrusted = false;
    result.reasons.push("baseline_through_date_filter_zero");
  }

  if (result.monthRangeRecordCount > 0 && liveHas) {
    result.dateFilterTrusted = true;
    result.reasons.push("month_range_has_records");
  }

  log.info("[texas:date-filter-validation]", { ...result });

  return result;
}
