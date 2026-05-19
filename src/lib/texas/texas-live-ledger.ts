import { computeAlFarq, roundMoney } from "@/lib/accounting/formulas";
import type { DailyLedger } from "@/lib/supabase/database.types";
import {
  pickNumeric,
  pickString,
  statsRecordMapping,
  walletMapping,
} from "@/lib/texas/field-resolver";
import type {
  SubAgentStatisticsRecord,
  TexasAgentWalletResult,
} from "@/lib/texas/types";

/** Display metrics sourced live from Texas API (cumulative panel values). */
export interface TexasLiveLedgerMetrics {
  tebat: number;
  suhoubat: number;
  al_farq: number;
  al_harq: number;
  wasel_menho: number;
  wasel_eleih: number;
  baqi_qadim: number;
  al_nihai: number;
}

export function texasRoleLabel(roleCode: string | undefined): string {
  if (roleCode === "1") return "super_master";
  if (roleCode === "2") return "agent";
  if (roleCode === "70") return "agent";
  if (roleCode === "3") return "player";
  return roleCode ?? "agent";
}

export function metricsFromTexasSources(
  stats: SubAgentStatisticsRecord | null,
  wallet: TexasAgentWalletResult | null
): TexasLiveLedgerMetrics {
  const row = (stats ?? {}) as Record<string, unknown>;
  const tebat = stats
    ? pickNumeric(row, statsRecordMapping.totalDeposit)
    : 0;
  const suhoubat = stats
    ? pickNumeric(row, statsRecordMapping.totalWithdraw)
    : 0;
  const al_harq = stats ? pickNumeric(row, statsRecordMapping.ngr) : 0;
  const al_farq = computeAlFarq(tebat, suhoubat);

  const walletRow = (wallet ?? {}) as Record<string, unknown>;
  const walletBalance = wallet
    ? pickNumeric(walletRow, walletMapping.balance)
    : stats
      ? pickNumeric(row, ["balance"])
      : 0;

  return {
    tebat,
    suhoubat,
    al_farq,
    al_harq,
    wasel_menho: 0,
    wasel_eleih: 0,
    baqi_qadim: 0,
    al_nihai: roundMoney(walletBalance),
  };
}

export function texasMetricsToDailyLedger(
  affiliateId: string,
  ledgerDate: string,
  metrics: TexasLiveLedgerMetrics
): DailyLedger {
  return {
    id: `texas-live-${affiliateId}-${ledgerDate}`,
    user_id: affiliateId,
    ledger_date: ledgerDate,
    status: "open",
    tebat: metrics.tebat,
    suhoubat: metrics.suhoubat,
    al_farq: metrics.al_farq,
    al_harq: metrics.al_harq,
    wasel_menho: metrics.wasel_menho,
    wasel_eleih: metrics.wasel_eleih,
    baqi_qadim: metrics.baqi_qadim,
    al_nihai: metrics.al_nihai,
    discrepancy_flag: false,
    updated_at: new Date().toISOString(),
  };
}

export function pickAffiliateId(
  stats: SubAgentStatisticsRecord
): string | null {
  return pickString(
    stats as Record<string, unknown>,
    statsRecordMapping.affiliateId
  );
}
