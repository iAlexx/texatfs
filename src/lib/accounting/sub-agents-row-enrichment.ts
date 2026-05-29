import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeMtdLedgerMetricsForUser,
  type MtdLedgerMetrics,
  type MtdTexasStrategy,
} from "@/lib/accounting/mtd-ledger-metrics";
import { resolvePreviousMonthKey } from "@/lib/accounting/monthly-agent-settlement";
import type { MonthlyCommissionRow } from "@/lib/accounting/monthly-commission-repository";
import type { TexasSubAgentRow } from "@/lib/texas/texas-live-sub-agents";
import { normalizeAffiliateId } from "@/lib/texas/sub-agents-direct-merge";
import type {
  SubAgentCommissionDisplayStatus,
  SubAgentCommissionStatus,
  SubAgentMtdMetrics,
  SubAgentWhatsAppStatus,
} from "@/lib/texas/sub-agents-types";
import { roundMoney } from "@/lib/accounting/formulas";

export type {
  SubAgentCommissionDisplayStatus,
  SubAgentCommissionStatus,
  SubAgentMtdMetrics,
  SubAgentWhatsAppStatus,
} from "@/lib/texas/sub-agents-types";

export interface EnrichedSubAgentRow extends TexasSubAgentRow {
  mtd: SubAgentMtdMetrics;
  whatsapp: SubAgentWhatsAppStatus;
  commission: SubAgentCommissionStatus;
}

export function mtdMetricsToSubAgentShape(mtd: MtdLedgerMetrics): SubAgentMtdMetrics {
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
  };
}

/** Apply MTD metrics to row.metrics (primary display values). */
export function applyMtdToSubAgentRow(
  agent: TexasSubAgentRow,
  mtd: SubAgentMtdMetrics
): TexasSubAgentRow & { mtd: SubAgentMtdMetrics } {
  return {
    ...agent,
    mtd,
    metrics: {
      tebat: mtd.tebat_mtd,
      suhoubat: mtd.suhoubat_mtd,
      al_farq: mtd.al_farq_mtd,
      al_harq: mtd.al_harq_mtd,
      wasel_menho: mtd.wasel_menho_mtd,
      wasel_eleih: mtd.wasel_eleih_mtd,
      baqi_qadim: mtd.baqi_qadim,
      al_nihai: mtd.al_nihai_mtd,
    },
  };
}

export async function computeMtdForSubAgentUser(
  supabase: SupabaseClient,
  agentUserId: string,
  ledgerDate: string
): Promise<SubAgentMtdMetrics> {
  const mtd = await computeMtdLedgerMetricsForUser(
    supabase,
    agentUserId,
    ledgerDate
  );
  return mtdMetricsToSubAgentShape(mtd);
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
  agentRowsWithMtdMetrics: number;
  whatsappGroupStatusCount: { exists: number; missing: number };
  commissionStatusCount: Record<SubAgentCommissionDisplayStatus, number>;
}> {
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

  const enriched = await Promise.all(
    agents.map(async (agent) => {
      const aid = normalizeAffiliateId(agent.affiliateId);
      const agentUserId = agent.user_id;

      let mtd: SubAgentMtdMetrics;
      if (agentUserId) {
        mtd = await computeMtdForSubAgentUser(
          supabase,
          agentUserId,
          ledgerDate
        );
        agentRowsWithMtdMetrics += 1;
      } else {
        mtd = mtdMetricsToSubAgentShape({
          tebatMtd: 0,
          suhoubatMtd: 0,
          waselMenhoMtd: 0,
          waselEleihMtd: 0,
          baqiQadimMtd: 0,
          alFarqMtd: 0,
          alHarqMtd: 0,
          alNihaiMtd: 0,
          discrepancyFlag: false,
          texasStrategy: "sum_daily_ledger_rows",
        });
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

      const base = applyMtdToSubAgentRow(agent, mtd);
      return {
        ...base,
        whatsapp: {
          group_exists,
          group_id: group?.group_id ?? null,
          group_name: group?.group_name ?? null,
          parent_whatsapp_verified: options.parentWhatsappVerified,
        },
        commission,
      };
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
    whatsappGroupStatusCount,
    commissionStatusCount,
  };
}
