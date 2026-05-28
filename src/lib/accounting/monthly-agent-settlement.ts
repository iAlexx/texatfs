import type { SupabaseClient } from "@supabase/supabase-js";
import { computeMonthlyCumulativeLedgerView } from "@/lib/accounting/monthly-ledger-view";
import { roundMoney } from "@/lib/accounting/formulas";

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
 * Monthly burn = |al_harq MTD| from daily ledger rows (Texas panel deltas).
 * Final before commission = al_nihai MTD for the closed month.
 */
export async function loadMonthlyAgentSettlement(
  supabase: SupabaseClient,
  agentUserId: string,
  monthKey: string
): Promise<MonthlyAgentSettlement | null> {
  const monthStart = monthKeyToMonthStart(monthKey);
  const monthEnd = monthKeyToMonthEnd(monthKey);

  const { data: mtdRows, error } = await supabase
    .from("daily_ledgers")
    .select("tebat,suhoubat,wasel_menho,wasel_eleih")
    .eq("user_id", agentUserId)
    .gte("ledger_date", monthStart)
    .lte("ledger_date", monthEnd);

  if (error) throw error;
  if (!mtdRows?.length) return null;

  const { data: prevClosed } = await supabase
    .from("daily_ledgers")
    .select("al_nihai")
    .eq("user_id", agentUserId)
    .eq("status", "closed")
    .lt("ledger_date", monthStart)
    .order("ledger_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const mtd = computeMonthlyCumulativeLedgerView({
    ledgerDate: monthEnd,
    rowsFromMonthStartInclusive: mtdRows,
    baqiQadimFixedCarry: Number(prevClosed?.al_nihai ?? 0),
  });

  const burnAmount = roundMoney(Math.abs(mtd.alHarqMtd));

  return {
    monthKey,
    monthEndDate: monthEnd,
    burnAmount,
    finalBeforeCommission: mtd.alNihaiMtd,
    tebatMtd: mtd.tebatMtd,
    suhoubatMtd: mtd.suhoubatMtd,
    alHarqMtd: mtd.alHarqMtd,
    alNihaiMtd: mtd.alNihaiMtd,
  };
}
