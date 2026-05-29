import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeMtdLedgerMetricsForUser,
  isMtdEmptyFallback,
  type MtdLedgerMetricsResult,
} from "@/lib/accounting/mtd-ledger-metrics";
import { resolvePreviousMonthKey } from "@/lib/accounting/monthly-agent-settlement";
import type { MonthlyCommissionRow } from "@/lib/accounting/monthly-commission-repository";
import type { TexasSubAgentRow } from "@/lib/texas/texas-live-sub-agents";
import { normalizeAffiliateId } from "@/lib/texas/sub-agents-direct-merge";
import type { TexasLiveLedgerMetrics } from "@/lib/texas/texas-live-ledger";
import type {
  SubAgentCommissionDisplayStatus,
  SubAgentCommissionStatus,
  SubAgentMetricsSource,
  SubAgentMtdMetrics,
  SubAgentWhatsAppStatus,
} from "@/lib/texas/sub-agents-types";
import { roundMoney } from "@/lib/accounting/formulas";

export type {
  SubAgentCommissionDisplayStatus,
  SubAgentCommissionStatus,
  SubAgentMetricsSource,
  SubAgentMtdMetrics,
  SubAgentWhatsAppStatus,
} from "@/lib/texas/sub-agents-types";

export interface EnrichedSubAgentRow extends TexasSubAgentRow {
  mtd: SubAgentMtdMetrics;
  metrics_source: SubAgentMetricsSource;
  whatsapp: SubAgentWhatsAppStatus;
  commission: SubAgentCommissionStatus;
}

export interface SubAgentEnrichmentStats {
  agentRowsWithMtdMetrics: number;
  rowsUsingMtdSnapshot: number;
  rowsUsingDailyRowsFallback: number;
  rowsUsingLiveTexasFallback: number;
  rowsEmptyNoData: number;
  whatsappGroupStatusCount: { exists: number; missing: number };
  commissionStatusCount: Record<SubAgentCommissionDisplayStatus, number>;
}

export function mtdMetricsToSubAgentShape(
  mtd: MtdLedgerMetricsResult
): SubAgentMtdMetrics {
  return {
    tebat_mtd: mtd.tebatMtd,
    suhoubat_mtd: mtd.suhoubatMtd,
    al_farq_mtd: mtd.alFarqMtd,
    al_harq_mtd: mtd.alHarqMtd,
    wasel_menho_mtd: mtd.waselMenhoMtd,
    wasel_eleih_mtd: mtd.waselEleihMtd,
    baqi_qadim: mtd.baqiQadimMtd,
    al_nihai_mtd: mtd.alNihaiMtd,
    texas_strategy: mtd.texasStrategy,
    current_snapshot_found: mtd.currentSnapshotFound,
    baseline_snapshot_found: mtd.baselineSnapshotFound,
    daily_rows_count: mtd.dailyRowsCount,
    is_empty_fallback: mtd.isEmptyFallback,
  };
}

export function metricsFromMtdShape(mtd: SubAgentMtdMetrics): TexasLiveLedgerMetrics {
  return {
    tebat: mtd.tebat_mtd,
    suhoubat: mtd.suhoubat_mtd,
    al_farq: mtd.al_farq_mtd,
    al_harq: mtd.al_harq_mtd,
    wasel_menho: mtd.wasel_menho_mtd,
    wasel_eleih: mtd.wasel_eleih_mtd,
    baqi_qadim: mtd.baqi_qadim,
    al_nihai: mtd.al_nihai_mtd,
  };
}

export function liveMetricsToMtdShape(
  agent: TexasSubAgentRow
): SubAgentMtdMetrics {
  const m = agent.metrics;
  return {
    tebat_mtd: m.tebat,
    suhoubat_mtd: m.suhoubat,
    al_farq_mtd: m.al_farq,
    al_harq_mtd: m.al_harq,
    wasel_menho_mtd: m.wasel_menho,
    wasel_eleih_mtd: m.wasel_eleih,
    baqi_qadim: m.baqi_qadim,
    al_nihai_mtd: m.al_nihai,
    texas_strategy: "sum_daily_ledger_rows",
    current_snapshot_found: false,
    baseline_snapshot_found: false,
    daily_rows_count: 0,
    is_empty_fallback: true,
  };
}

/** True when Texas live enrichment has any non-zero financial field. */
export function liveMetricsHaveData(agent: TexasSubAgentRow): boolean {
  if (agent.has_live_texas_data === false) return false;
  const m = agent.metrics;
  return (
    m.tebat !== 0 ||
    m.suhoubat !== 0 ||
    m.al_farq !== 0 ||
    m.al_harq !== 0 ||
    m.wasel_menho !== 0 ||
    m.wasel_eleih !== 0 ||
    m.baqi_qadim !== 0 ||
    m.al_nihai !== 0
  );
}

/**
 * Choose displayed metrics: MTD when DB has data, else keep Texas live numbers.
 */
export function resolveSubAgentRowMetrics(
  agent: TexasSubAgentRow,
  mtdResult: MtdLedgerMetricsResult | null
): {
  metrics: TexasLiveLedgerMetrics;
  mtd: SubAgentMtdMetrics;
  metrics_source: SubAgentMetricsSource;
} {
  const liveHas = liveMetricsHaveData(agent);

  if (!mtdResult) {
    if (liveHas) {
      return {
        metrics: { ...agent.metrics },
        mtd: liveMetricsToMtdShape(agent),
        metrics_source: "live_texas_fallback",
      };
    }
    return {
      metrics: { ...agent.metrics },
      mtd: liveMetricsToMtdShape(agent),
      metrics_source: "empty_no_data",
    };
  }

  const mtdShape = mtdMetricsToSubAgentShape(mtdResult);

  if (mtdResult.currentSnapshotFound) {
    return {
      metrics: metricsFromMtdShape(mtdShape),
      mtd: mtdShape,
      metrics_source: "mtd_snapshot",
    };
  }

  if (
    mtdResult.dailyRowsCount > 0 &&
    mtdResult.texasStrategy === "sum_daily_ledger_rows"
  ) {
    return {
      metrics: metricsFromMtdShape(mtdShape),
      mtd: mtdShape,
      metrics_source: "mtd_daily_rows",
    };
  }

  if (isMtdEmptyFallback(mtdResult) && liveHas) {
    return {
      metrics: { ...agent.metrics },
      mtd: liveMetricsToMtdShape(agent),
      metrics_source: "live_texas_fallback",
    };
  }

  if (liveHas) {
    return {
      metrics: { ...agent.metrics },
      mtd: liveMetricsToMtdShape(agent),
      metrics_source: "live_texas_fallback",
    };
  }

  return {
    metrics: metricsFromMtdShape(mtdShape),
    mtd: mtdShape,
    metrics_source: "empty_no_data",
  };
}

function mapCommissionRow(row: MonthlyCommissionRow): SubAgentCommissionStatus {
  let status: SubAgentCommissionDisplayStatus = "none";
  if (row.status === "completed") status = "completed";
  else if (row.status === "expired") status = "expired";
  else if (row.status === "failed") status = "failed";
  else if (row.status === "pending") {
    status = row.percent != null ? "completed" : "pending_percent";
  }

  return {
    month_key: row.month_key,
    status,
    percent: row.percent != null ? Number(row.percent) : null,
    commission_amount:
      row.commission_amount != null ? Number(row.commission_amount) : null,
    final_before_commission: Number(row.final_before_commission),
    final_after_commission:
      row.final_after_commission != null
        ? Number(row.final_after_commission)
        : null,
  };
}

const EMPTY_COMMISSION: SubAgentCommissionStatus = {
  month_key: "",
  status: "none",
  percent: null,
  commission_amount: null,
  final_before_commission: null,
  final_after_commission: null,
};

/**
 * Batch-enrich direct sub-agent rows with per-child MTD (never master ledger).
 * Never overwrites valid Texas live metrics with empty MTD zeros.
 */
export async function enrichSubAgentsWithPerAgentData(
  supabase: SupabaseClient,
  parentUserId: string,
  agents: TexasSubAgentRow[],
  ledgerDate: string,
  options: {
    parentWhatsappVerified: boolean;
  }
): Promise<{
  agents: EnrichedSubAgentRow[];
} & SubAgentEnrichmentStats> {
  const affiliateIds = agents
    .map((a) => normalizeAffiliateId(a.affiliateId))
    .filter((id): id is string => Boolean(id));

  const { data: groups } = await supabase
    .from("whatsapp_agent_groups")
    .select("affiliate_id, group_id, group_name, is_active")
    .eq("user_id", parentUserId)
    .in("affiliate_id", affiliateIds.length ? affiliateIds : ["__none__"]);

  const groupByAffiliate = new Map<
    string,
    { group_id: string; group_name: string | null }
  >();
  for (const g of groups ?? []) {
    const aid = normalizeAffiliateId(String(g.affiliate_id));
    if (!aid || !g.is_active) continue;
    const gid = String(g.group_id ?? "").trim();
    if (!gid || gid.startsWith("pending:")) continue;
    groupByAffiliate.set(aid, {
      group_id: gid,
      group_name: (g.group_name as string | null) ?? null,
    });
  }

  const previousMonthKey = resolvePreviousMonthKey(ledgerDate);
  const currentMonthKey = ledgerDate.slice(0, 7);

  const { data: commissionRows } = await supabase
    .from("monthly_agent_commissions")
    .select("*")
    .eq("parent_user_id", parentUserId)
    .in("month_key", [previousMonthKey, currentMonthKey])
    .in("affiliate_id", affiliateIds.length ? affiliateIds : ["__none__"]);

  const commissionByAffiliate = new Map<string, MonthlyCommissionRow>();
  for (const row of (commissionRows ?? []) as MonthlyCommissionRow[]) {
    const aid = normalizeAffiliateId(row.affiliate_id);
    if (!aid) continue;
    const existing = commissionByAffiliate.get(aid);
    if (!existing || row.month_key > existing.month_key) {
      commissionByAffiliate.set(aid, row);
    }
  }

  const commissionStatusCount: Record<
    SubAgentCommissionDisplayStatus,
    number
  > = {
    none: 0,
    pending_percent: 0,
    completed: 0,
    expired: 0,
    failed: 0,
  };

  const whatsappGroupStatusCount = { exists: 0, missing: 0 };
  let agentRowsWithMtdMetrics = 0;
  let rowsUsingMtdSnapshot = 0;
  let rowsUsingDailyRowsFallback = 0;
  let rowsUsingLiveTexasFallback = 0;
  let rowsEmptyNoData = 0;

  const enriched = await Promise.all(
    agents.map(async (agent) => {
      const aid = normalizeAffiliateId(agent.affiliateId);
      const agentUserId = agent.user_id;

      let mtdResult: MtdLedgerMetricsResult | null = null;
      if (agentUserId) {
        mtdResult = await computeMtdLedgerMetricsForUser(
          supabase,
          agentUserId,
          ledgerDate
        );
        agentRowsWithMtdMetrics += 1;
      }

      const resolved = resolveSubAgentRowMetrics(agent, mtdResult);

      switch (resolved.metrics_source) {
        case "mtd_snapshot":
          rowsUsingMtdSnapshot += 1;
          break;
        case "mtd_daily_rows":
          rowsUsingDailyRowsFallback += 1;
          break;
        case "live_texas_fallback":
          rowsUsingLiveTexasFallback += 1;
          break;
        case "empty_no_data":
          rowsEmptyNoData += 1;
          break;
      }

      const group = aid ? groupByAffiliate.get(aid) : undefined;
      const group_exists = Boolean(group?.group_id);
      if (group_exists) whatsappGroupStatusCount.exists += 1;
      else whatsappGroupStatusCount.missing += 1;

      const commissionRow = aid ? commissionByAffiliate.get(aid) : undefined;
      const commission = commissionRow
        ? mapCommissionRow(commissionRow)
        : { ...EMPTY_COMMISSION, month_key: previousMonthKey };
      commissionStatusCount[commission.status] += 1;

      return {
        ...agent,
        metrics: resolved.metrics,
        mtd: resolved.mtd,
        metrics_source: resolved.metrics_source,
        whatsapp: {
          group_exists,
          group_id: group?.group_id ?? null,
          group_name: group?.group_name ?? null,
          parent_whatsapp_verified: options.parentWhatsappVerified,
        },
        commission,
      } satisfies EnrichedSubAgentRow;
    })
  );

  for (const row of enriched) {
    row.metrics.tebat = roundMoney(row.metrics.tebat);
    row.metrics.suhoubat = roundMoney(row.metrics.suhoubat);
    row.metrics.al_farq = roundMoney(row.metrics.al_farq);
    row.metrics.al_harq = roundMoney(row.metrics.al_harq);
    row.metrics.wasel_menho = roundMoney(row.metrics.wasel_menho);
    row.metrics.wasel_eleih = roundMoney(row.metrics.wasel_eleih);
    row.metrics.baqi_qadim = roundMoney(row.metrics.baqi_qadim);
    row.metrics.al_nihai = roundMoney(row.metrics.al_nihai);
  }

  return {
    agents: enriched,
    agentRowsWithMtdMetrics,
    rowsUsingMtdSnapshot,
    rowsUsingDailyRowsFallback,
    rowsUsingLiveTexasFallback,
    rowsEmptyNoData,
    whatsappGroupStatusCount,
    commissionStatusCount,
  };
}
