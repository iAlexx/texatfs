import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyMtdMetricsToLedger,
  computeMtdLedgerMetricsForUser,
} from "@/lib/accounting/mtd-ledger-metrics";
import { roundMoney } from "@/lib/accounting/formulas";
import type { DailyLedger } from "@/lib/supabase/database.types";

export function resolvePreviousMonthKey(ledgerDateIso: string): string {
  const y = Number(ledgerDateIso.slice(0, 4));
  const m = Number(ledgerDateIso.slice(5, 7));
  const d = new Date(Date.UTC(y, m - 2, 1));
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${d.getUTCFullYear()}-${mm}`;
}

export function monthKeyToMonthStart(monthKey: string): string {
  return `${monthKey}-01`;
}

export function monthKeyToMonthEnd(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0));
  return last.toISOString().slice(0, 10);
}

const AR_MONTH_NAMES: Record<string, string> = {
  "01": "يناير",
  "02": "فبراير",
  "03": "مارس",
  "04": "أبريل",
  "05": "أيار",
  "06": "حزيران",
  "07": "تموز",
  "08": "آب",
  "09": "أيلول",
  "10": "تشرين الأول",
  "11": "تشرين الثاني",
  "12": "كانون الأول",
};

export function formatMonthKeyArabic(monthKey: string): string {
  const mm = monthKey.slice(5, 7);
  const yyyy = monthKey.slice(0, 4);
  const name = AR_MONTH_NAMES[mm] ?? mm;
  return `${name} ${yyyy}`;
}

export interface MonthlyAgentSettlement {
  monthKey: string;
  monthEndDate: string;
  burnAmount: number;
  finalBeforeCommission: number;
  tebatMtd: number;
  suhoubatMtd: number;
  alHarqMtd: number;
  alNihaiMtd: number;
}

/**
 * Monthly burn = |al_harq MTD| (Transaction snapshots + wasel MTD).
 * Final before commission = al_nihai MTD for the closed month.
 */
export async function loadMonthlyAgentSettlement(
  supabase: SupabaseClient,
  agentUserId: string,
  monthKey: string
): Promise<MonthlyAgentSettlement | null> {
  const monthStart = monthKeyToMonthStart(monthKey);
  const monthEnd = monthKeyToMonthEnd(monthKey);

  const { data: ledgerRow } = await supabase
    .from("daily_ledgers")
    .select("id, user_id, ledger_date, status, tebat, suhoubat, al_farq, al_harq, wasel_menho, wasel_eleih, baqi_qadim, al_nihai, discrepancy_flag, updated_at")
    .eq("user_id", agentUserId)
    .eq("ledger_date", monthEnd)
    .maybeSingle();

  if (!ledgerRow) {
    const { data: anyRow } = await supabase
      .from("daily_ledgers")
      .select("id, user_id, ledger_date, status, tebat, suhoubat, al_farq, al_harq, wasel_menho, wasel_eleih, baqi_qadim, al_nihai, discrepancy_flag, updated_at")
      .eq("user_id", agentUserId)
      .gte("ledger_date", monthStart)
      .lte("ledger_date", monthEnd)
      .order("ledger_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!anyRow) return null;
    const base = mapLedgerFromRow(anyRow);
    const mtd = await computeMtdLedgerMetricsForUser(
      supabase,
      agentUserId,
      base.ledger_date
    );
    const ledger = applyMtdMetricsToLedger(base, mtd);
    return settlementFromLedger(monthKey, monthEnd, ledger);
  }

  const base = mapLedgerFromRow(ledgerRow);
  const mtd = await computeMtdLedgerMetricsForUser(
    supabase,
    agentUserId,
    base.ledger_date
  );
  const ledger = applyMtdMetricsToLedger(base, mtd);
  return settlementFromLedger(monthKey, monthEnd, ledger);
}

function mapLedgerFromRow(row: Record<string, unknown>): DailyLedger {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    ledger_date: String(row.ledger_date),
    status: row.status as DailyLedger["status"],
    tebat: Number(row.tebat),
    suhoubat: Number(row.suhoubat),
    al_farq: Number(row.al_farq),
    al_harq: Number(row.al_harq),
    wasel_menho: Number(row.wasel_menho),
    wasel_eleih: Number(row.wasel_eleih),
    baqi_qadim: Number(row.baqi_qadim),
    al_nihai: Number(row.al_nihai),
    discrepancy_flag: Boolean(row.discrepancy_flag),
    updated_at: String(row.updated_at),
  };
}

function settlementFromLedger(
  monthKey: string,
  monthEndDate: string,
  ledger: DailyLedger
): MonthlyAgentSettlement {
  const burnAmount = roundMoney(Math.abs(ledger.al_harq));

  return {
    monthKey,
    monthEndDate,
    burnAmount,
    finalBeforeCommission: ledger.al_nihai,
    tebatMtd: ledger.tebat,
    suhoubatMtd: ledger.suhoubat,
    alHarqMtd: ledger.al_harq,
    alNihaiMtd: ledger.al_nihai,
  };
}
