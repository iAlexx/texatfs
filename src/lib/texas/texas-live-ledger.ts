import { computeAlFarq, computeAlNihai, roundMoney } from "@/lib/accounting/formulas";
import type { DailyLedger } from "@/lib/supabase/database.types";
import {
  logFieldMappingDiagnosticsOnce,
  pickNumeric,
  pickString,
  statsRecordMapping,
  walletMapping,
} from "@/lib/texas/field-resolver";
import type {
  SubAgentStatisticsRecord,
  TexasAgentWalletResult,
} from "@/lib/texas/types";
import type { TransferSummaryPerAgent } from "@/lib/texas/fetch-agents-transfers";

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

/**
 * Build metrics from Texas API sources.
 *
 * Field mapping:
 *   tebat         = cumulative totalDeposit  (from getSubAgentStatistics)
 *   suhoubat      = cumulative totalWithdraw (from getSubAgentStatistics)
 *   al_farq       = tebat − suhoubat         (computed)
 *   al_harq       = cumulative NGR/burn      (from getSubAgentStatistics)
 *   wasel_eleih   = deposits master→agent    (from getAgentsTransfers type=2)
 *   wasel_menho   = withdraws master←agent   (from getAgentsTransfers type=3)
 *   baqi_qadim    = 0 (no historical snapshot for live sub-agents)
 *   al_nihai      = wallet balance            (from getAgentWalletByAgentId)
 *                   Falls back to formula when wallet unavailable.
 */
export function metricsFromTexasSources(
  stats: SubAgentStatisticsRecord | null,
  wallet: TexasAgentWalletResult | null,
  transfers?: TransferSummaryPerAgent | null
): TexasLiveLedgerMetrics {
  const row = (stats ?? {}) as Record<string, unknown>;

  // One-time diagnostic per process lifecycle — logs resolved field keys
  if (stats) logFieldMappingDiagnosticsOnce(row);

  const tebat    = stats ? pickNumeric(row, statsRecordMapping.totalDeposit)  : 0;
  const suhoubat = stats ? pickNumeric(row, statsRecordMapping.totalWithdraw) : 0;
  const al_harq  = stats ? pickNumeric(row, statsRecordMapping.ngr)           : 0;
  const al_farq  = computeAlFarq(tebat, suhoubat);

  const wasel_eleih  = roundMoney(transfers?.depositsToAgent   ?? 0);
  const wasel_menho  = roundMoney(transfers?.withdrawsFromAgent ?? 0);
  const baqi_qadim   = 0;

  // Prefer real-time wallet balance as al_nihai (most accurate)
  const walletRow     = (wallet ?? {}) as Record<string, unknown>;
  const walletBalance = wallet
    ? pickNumeric(walletRow, walletMapping.balance)
    : stats
      ? pickNumeric(row, ["balance"])
      : null;

  const al_nihai =
    walletBalance !== null && walletBalance !== 0
      ? roundMoney(walletBalance)
      : computeAlNihai({ al_farq, wasel_menho, wasel_eleih, baqi_qadim });

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
    tebat:        metrics.tebat,
    suhoubat:     metrics.suhoubat,
    al_farq:      metrics.al_farq,
    al_harq:      metrics.al_harq,
    wasel_menho:  metrics.wasel_menho,
    wasel_eleih:  metrics.wasel_eleih,
    baqi_qadim:   metrics.baqi_qadim,
    al_nihai:     metrics.al_nihai,
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
