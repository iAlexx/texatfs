import { computeAlFarq, computeAlHarqFromAlFarq, computeAlNihai, roundMoney } from "@/lib/accounting/formulas";
import type { DailyLedger } from "@/lib/supabase/database.types";
import {
  logFieldMappingDiagnosticsOnce,
  pickStatsRecordMetrics,
  pickString,
  statsRecordMapping,
} from "@/lib/texas/field-resolver";
import type { SubAgentStatisticsRecord } from "@/lib/texas/types";

/**
 * Live sub-agent panel metrics.
 * Texas portal: tebat, suhoubat, al_farq, al_harq (= al_farq).
 * Wasel + final balance come from master daily_ledgers / WhatsApp — not Texas transfers.
 */
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

/**
 * Texas portal fields only for live sub-agent rows.
 * Wasel fields are zero — sourced exclusively from WhatsApp `transactions` on the master ledger.
 */
export function metricsFromTexasSources(
  stats: SubAgentStatisticsRecord | null
): TexasLiveLedgerMetrics {
  const row = (stats ?? {}) as Record<string, unknown>;

  if (stats) logFieldMappingDiagnosticsOnce(row);

  const { totalDeposit: tebat, totalWithdraw: suhoubat } = stats
    ? pickStatsRecordMetrics(row)
    : { totalDeposit: 0, totalWithdraw: 0 };

  const al_farq = computeAlFarq(tebat, suhoubat);
  const al_harq = computeAlHarqFromAlFarq(al_farq);
  const wasel_menho = 0;
  const wasel_eleih = 0;
  const baqi_qadim = 0;
  const al_nihai = computeAlNihai({
    al_farq,
    wasel_menho,
    wasel_eleih,
    baqi_qadim,
  });

  return {
    tebat,
    suhoubat,
    al_farq,
    al_harq,
    wasel_menho,
    wasel_eleih,
    baqi_qadim,
    al_nihai,
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
