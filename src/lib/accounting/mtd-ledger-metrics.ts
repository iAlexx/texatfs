import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeAlFarq,
  computeAlHarqFromAlFarq,
  computeAlNihai,
  roundMoney,
} from "@/lib/accounting/formulas";
import {
  computeMonthlyCumulativeLedgerView,
  resolveMonthStart,
  type LedgerRowLike,
} from "@/lib/accounting/monthly-ledger-view";
import { reconcileLedger } from "@/lib/finance/reconciliation";
import type { DailyLedger } from "@/lib/supabase/database.types";
import type { NormalizedTexasSnapshot } from "@/lib/texas/types";

/** How MTD tebat/suhoubat were derived (logged for ops). */
export type MtdTexasStrategy =
  | "transaction_snapshot_delta"
  | "sum_daily_ledger_rows";

export interface MtdLedgerMetrics {
  tebatMtd: number;
  suhoubatMtd: number;
  waselMenhoMtd: number;
  waselEleihMtd: number;
  baqiQadimMtd: number;
  alFarqMtd: number;
  alHarqMtd: number;
  alNihaiMtd: number;
  discrepancyFlag: boolean;
  texasStrategy: MtdTexasStrategy;
}

export interface MtdLedgerMetricsDiagnostics {
  currentSnapshotFound: boolean;
  baselineSnapshotFound: boolean;
  dailyRowsCount: number;
  /** True when no snapshot and no daily ledger rows contributed tebat/suhoubat. */
  isEmptyFallback: boolean;
}

export type MtdLedgerMetricsResult = MtdLedgerMetrics &
  MtdLedgerMetricsDiagnostics;

export function computeMtdFromTransactionSnapshots(
  current: Pick<NormalizedTexasSnapshot, "totalDeposit" | "totalWithdraw">,
  baselineBeforeMonth: Pick<
    NormalizedTexasSnapshot,
    "totalDeposit" | "totalWithdraw"
  > | null
): { tebatMtd: number; suhoubatMtd: number } {
  const baseDep = baselineBeforeMonth?.totalDeposit ?? 0;
  const baseWd = baselineBeforeMonth?.totalWithdraw ?? 0;
  return {
    tebatMtd: roundMoney(current.totalDeposit - baseDep),
    suhoubatMtd: roundMoney(current.totalWithdraw - baseWd),
  };
}

export function buildMtdLedgerMetrics(params: {
  tebatMtd: number;
  suhoubatMtd: number;
  waselMenhoMtd: number;
  waselEleihMtd: number;
  baqiQadimMtd: number;
}): MtdLedgerMetrics {
  const alFarqMtd = computeAlFarq(params.tebatMtd, params.suhoubatMtd);
  const alHarqMtd = computeAlHarqFromAlFarq(alFarqMtd);
  const alNihaiMtd = computeAlNihai({
    al_farq: alFarqMtd,
    wasel_menho: params.waselMenhoMtd,
    wasel_eleih: params.waselEleihMtd,
    baqi_qadim: params.baqiQadimMtd,
  });

  const reconcile = reconcileLedger({
    tebat: params.tebatMtd,
    suhoubat: params.suhoubatMtd,
    wasel_menho: params.waselMenhoMtd,
    wasel_eleih: params.waselEleihMtd,
  });

  return {
    tebatMtd: params.tebatMtd,
    suhoubatMtd: params.suhoubatMtd,
    waselMenhoMtd: params.waselMenhoMtd,
    waselEleihMtd: params.waselEleihMtd,
    baqiQadimMtd: params.baqiQadimMtd,
    alFarqMtd,
    alHarqMtd,
    alNihaiMtd,
    discrepancyFlag: !reconcile.balanced,
    texasStrategy: "transaction_snapshot_delta",
  };
}

async function sumConfirmedWaselForDateRange(
  supabase: SupabaseClient,
  userId: string,
  fromDate: string,
  toDate: string
): Promise<{ wasel_menho: number; wasel_eleih: number }> {
  const { data: ledgers, error: ledgerErr } = await supabase
    .from("daily_ledgers")
    .select("id")
    .eq("user_id", userId)
    .gte("ledger_date", fromDate)
    .lte("ledger_date", toDate);

  if (ledgerErr) throw ledgerErr;
  const ids = (ledgers ?? []).map((r) => r.id as string);
  if (!ids.length) return { wasel_menho: 0, wasel_eleih: 0 };

  const { data, error } = await supabase
    .from("transactions")
    .select("type, amount")
    .in("daily_ledger_id", ids)
    .eq("is_confirmed", true)
    .eq("source", "whatsapp")
    .not("whatsapp_confirmed_at", "is", null);

  if (error) throw error;

  let wasel_menho = 0;
  let wasel_eleih = 0;
  for (const row of data ?? []) {
    const amount = Number(row.amount);
    if (row.type === "wasel_menho") wasel_menho += amount;
    else if (row.type === "wasel_eleih") wasel_eleih += amount;
  }

  return {
    wasel_menho: roundMoney(wasel_menho),
    wasel_eleih: roundMoney(wasel_eleih),
  };
}

async function loadSnapshotOnOrBefore(
  supabase: SupabaseClient,
  userId: string,
  onOrBeforeDate: string
): Promise<NormalizedTexasSnapshot | null> {
  const { data, error } = await supabase
    .from("api_snapshots")
    .select(
      "balance, total_deposit, total_withdraw, ngr, currency_code, raw_wallets, raw_statistics"
    )
    .eq("user_id", userId)
    .lte("ledger_date", onOrBeforeDate)
    .order("ledger_date", { ascending: false })
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    balance: Number(data.balance),
    totalDeposit: Number(data.total_deposit),
    totalWithdraw: Number(data.total_withdraw),
    ngr: Number(data.ngr),
    currencyCode: String(data.currency_code),
    rawWallets: (data.raw_wallets ?? {}) as Record<string, unknown>,
    rawStatistics: (data.raw_statistics ?? {}) as Record<string, unknown>,
  };
}

async function loadSnapshotForDate(
  supabase: SupabaseClient,
  userId: string,
  ledgerDate: string
): Promise<NormalizedTexasSnapshot | null> {
  const { data, error } = await supabase
    .from("api_snapshots")
    .select(
      "balance, total_deposit, total_withdraw, ngr, currency_code, raw_wallets, raw_statistics"
    )
    .eq("user_id", userId)
    .eq("ledger_date", ledgerDate)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    balance: Number(data.balance),
    totalDeposit: Number(data.total_deposit),
    totalWithdraw: Number(data.total_withdraw),
    ngr: Number(data.ngr),
    currencyCode: String(data.currency_code),
    rawWallets: (data.raw_wallets ?? {}) as Record<string, unknown>,
    rawStatistics: (data.raw_statistics ?? {}) as Record<string, unknown>,
  };
}

/**
 * Month-to-date cumulative metrics (primary accounting mode).
 *
 * Texas tebat/suhoubat:
 *   1) Prefer getAgentsTransfers cumulative in snapshots:
 *      current(totalDeposit/Withdraw) − baseline(last snapshot before month start)
 *   2) Fallback: sum daily_ledgers.tebat/suhoubat from month start through ledgerDate
 *
 * Wasel: sum confirmed WhatsApp transactions on ledgers in [monthStart, ledgerDate].
 * Baqi_qadim: al_nihai from last closed ledger strictly before month start.
 */
export function isMtdEmptyFallback(mtd: MtdLedgerMetricsDiagnostics): boolean {
  return (
    !mtd.currentSnapshotFound &&
    mtd.dailyRowsCount === 0 &&
    mtd.isEmptyFallback
  );
}

export async function computeMtdLedgerMetricsForUser(
  supabase: SupabaseClient,
  userId: string,
  ledgerDate: string
): Promise<MtdLedgerMetricsResult> {
  const monthStart = resolveMonthStart(ledgerDate);
  const dayBeforeMonth = previousCalendarDay(monthStart);

  const { data: prevClosed } = await supabase
    .from("daily_ledgers")
    .select("al_nihai")
    .eq("user_id", userId)
    .eq("status", "closed")
    .lt("ledger_date", monthStart)
    .order("ledger_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const baqiQadimMtd = roundMoney(Number(prevClosed?.al_nihai ?? 0));

  const wasel = await sumConfirmedWaselForDateRange(
    supabase,
    userId,
    monthStart,
    ledgerDate
  );

  const currentSnap =
    (await loadSnapshotForDate(supabase, userId, ledgerDate)) ??
    (await loadSnapshotOnOrBefore(supabase, userId, ledgerDate));

  const baselineSnap = await loadSnapshotOnOrBefore(
    supabase,
    userId,
    dayBeforeMonth
  );

  const currentSnapshotFound = Boolean(currentSnap);
  const baselineSnapshotFound = Boolean(baselineSnap);

  if (currentSnap) {
    const { tebatMtd, suhoubatMtd } = computeMtdFromTransactionSnapshots(
      currentSnap,
      baselineSnap
    );
    return {
      ...buildMtdLedgerMetrics({
        tebatMtd,
        suhoubatMtd,
        waselMenhoMtd: wasel.wasel_menho,
        waselEleihMtd: wasel.wasel_eleih,
        baqiQadimMtd,
      }),
      texasStrategy: "transaction_snapshot_delta",
      currentSnapshotFound,
      baselineSnapshotFound,
      dailyRowsCount: 0,
      isEmptyFallback: false,
    };
  }

  const { data: mtdRows } = await supabase
    .from("daily_ledgers")
    .select("tebat,suhoubat,wasel_menho,wasel_eleih")
    .eq("user_id", userId)
    .gte("ledger_date", monthStart)
    .lte("ledger_date", ledgerDate);

  const dailyRowsCount = mtdRows?.length ?? 0;

  const monthly = computeMonthlyCumulativeLedgerView({
    ledgerDate,
    rowsFromMonthStartInclusive: (mtdRows ?? []) as LedgerRowLike[],
    baqiQadimFixedCarry: baqiQadimMtd,
  });

  const isEmptyFallback = dailyRowsCount === 0;

  return {
    tebatMtd: monthly.tebatMtd,
    suhoubatMtd: monthly.suhoubatMtd,
    waselMenhoMtd: wasel.wasel_menho,
    waselEleihMtd: wasel.wasel_eleih,
    baqiQadimMtd,
    alFarqMtd: monthly.alFarqMtd,
    alHarqMtd: monthly.alHarqMtd,
    alNihaiMtd: monthly.alNihaiMtd,
    discrepancyFlag: monthly.discrepancyFlag,
    texasStrategy: "sum_daily_ledger_rows",
    currentSnapshotFound: false,
    baselineSnapshotFound,
    dailyRowsCount,
    isEmptyFallback,
  };
}

export function applyMtdMetricsToLedger(
  ledger: DailyLedger,
  mtd: MtdLedgerMetrics
): DailyLedger {
  return {
    ...ledger,
    tebat: mtd.tebatMtd,
    suhoubat: mtd.suhoubatMtd,
    al_farq: mtd.alFarqMtd,
    al_harq: mtd.alHarqMtd,
    wasel_menho: mtd.waselMenhoMtd,
    wasel_eleih: mtd.waselEleihMtd,
    baqi_qadim: mtd.baqiQadimMtd,
    al_nihai: mtd.alNihaiMtd,
    discrepancy_flag: mtd.discrepancyFlag,
  };
}

function previousCalendarDay(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
