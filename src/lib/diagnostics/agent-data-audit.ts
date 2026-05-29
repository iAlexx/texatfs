import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveUserCredentials } from "@/lib/scraper/resolve-user-credentials";
import { syncDirectChildrenViaMasterSession } from "@/lib/scraper/ensure-user-ledger-sync";
import { fetchAgentTransfers } from "@/lib/texas/fetch-agent-transfers";
import { fetchSubAgentGeneralReport } from "@/lib/texas/fetch-sub-agent-report";
import type { TexasHttpClient } from "@/lib/texas/texas-http-client";
import {
  mergeDirectChildrenWithTexas,
  normalizeAffiliateId,
  type DirectChildDbRow,
} from "@/lib/texas/sub-agents-direct-merge";
import {
  collectTexasChildrenForDbLink,
  filterTexasPortalDirectChildren,
} from "@/lib/texas/texas-portal-hierarchy";
import { fetchTexasSubAgentsLive } from "@/lib/texas/texas-live-sub-agents";
import { resolveViewerTexasAffiliateId } from "@/lib/texas/resolve-viewer-affiliate";
import {
  ensureTexasPortalDirectChildrenInDb,
} from "@/lib/texas/link-texas-portal-children";
import { enrichSubAgentsWithPerAgentData } from "@/lib/accounting/sub-agents-row-enrichment";
import {
  sumTransfersAttributedToAffiliate,
  transferAttributionLogPayload,
} from "@/lib/texas/transfer-affiliate-attribution";
import {
  reconcileFinancialTotals,
  type ReconciliationStatus,
} from "@/lib/diagnostics/data-reconciliation";

export type AgentAuditIssueReason =
  | "missing_db_user"
  | "wrong_parent_id"
  | "inactive_user"
  | "missing_affiliate_id"
  | "texas_not_returning_user"
  | "missing_api_snapshot"
  | "missing_daily_ledger"
  | "transfer_attribution_failed"
  | "credentials_missing"
  | "texas_auth_failed"
  | "fallback_to_zero"
  | "missing_baseline_snapshot"
  | "unknown";

export interface AgentChildAuditRow {
  affiliate_id: string;
  user_id: string | null;
  display_name: string | null;
  texas_username: string | null;
  parent_id_match: boolean;
  is_active: boolean;
  texas_present: boolean;
  db_present: boolean;
  linked_correctly: boolean;
  has_api_snapshot: boolean;
  has_daily_ledger: boolean;
  whatsapp_group_exists: boolean;
  commission_row_exists: boolean;
  texas_tx_deposit: number;
  texas_tx_withdraw: number;
  general_report_deposits: number | null;
  general_report_withdrawal: number | null;
  general_report_ngr: number | null;
  api_snapshot_total_deposit: number | null;
  api_snapshot_total_withdraw: number | null;
  daily_ledger_tebat: number | null;
  daily_ledger_suhoubat: number | null;
  ui_tebat: number | null;
  ui_suhoubat: number | null;
  metrics_source: string | null;
  reconciliation_status: ReconciliationStatus;
  reconciliation_diff: number;
  issues: AgentAuditIssueReason[];
}

export interface AgentDataAuditReport {
  generated_at: string;
  ledger_date: string;
  viewer: {
    user_id: string;
    telegram_id: number | null;
    texas_username: string | null;
    texas_affiliate_id: string | null;
    has_texas_credentials: boolean;
    subscription_active: boolean;
    role: string;
  };
  texas: {
    children_count: number;
    statistics_count: number;
    transfers_record_count: number;
    sub_agent_report_available: boolean;
    affiliate_ids_discovered: string[];
    auth_error: string | null;
  };
  supabase: {
    direct_children_count: number;
    children: AgentChildAuditRow[];
  };
  summary: {
    missing_db_users: number;
    wrong_parent_users: number;
    missing_money_rows: number;
    fallback_to_zero_rows: number;
    ok_rows: number;
    warning_rows: number;
    error_rows: number;
  };
  repair?: {
    linked: number;
    synced_via_master: number;
    errors: string[];
  };
}

async function resolveViewerUserId(
  supabase: SupabaseClient,
  input: { viewerUserId?: string; telegramUserId?: number }
): Promise<{ id: string; telegram_id: number | null }> {
  if (input.viewerUserId) {
    const { data, error } = await supabase
      .from("users")
      .select("id, telegram_id")
      .eq("id", input.viewerUserId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("viewer user not found");
    return { id: data.id, telegram_id: data.telegram_id as number | null };
  }
  if (input.telegramUserId) {
    const { data, error } = await supabase
      .from("users")
      .select("id, telegram_id")
      .eq("telegram_id", input.telegramUserId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("viewer not found for telegram id");
    return { id: data.id, telegram_id: data.telegram_id as number | null };
  }
  throw new Error("viewerUserId or telegramUserId required");
}

export async function runAgentDataAudit(params: {
  supabase: SupabaseClient;
  viewerUserId?: string;
  telegramUserId?: number;
  ledgerDate: string;
  texasClient?: TexasHttpClient;
  repair?: boolean;
}): Promise<AgentDataAuditReport> {
  const viewer = await resolveViewerUserId(params.supabase, params);
  const credCheck = await resolveUserCredentials(params.supabase, viewer.id);

  const { data: viewerRow } = await params.supabase
    .from("users")
    .select(
      "id, role, texas_username, texas_affiliate_id, is_active, subscription_end_date"
    )
    .eq("id", viewer.id)
    .maybeSingle();

  if (!viewerRow) throw new Error("viewer row missing");

  const subscriptionEnd = viewerRow.subscription_end_date
    ? new Date(viewerRow.subscription_end_date)
    : null;
  const subscriptionActive =
    Boolean(subscriptionEnd && subscriptionEnd.getTime() > Date.now());

  let texasAuthError: string | null = null;
  let childrenCount = 0;
  let statisticsCount = 0;
  let transfersRecordCount = 0;
  let subAgentReportAvailable = false;
  let affiliateIdsDiscovered: string[] = [];
  let allTransferRecords: Awaited<
    ReturnType<typeof fetchAgentTransfers>
  >["records"] = [];
  let texasLivePayload = null as Awaited<
    ReturnType<typeof fetchTexasSubAgentsLive>
  > | null;

  if (params.texasClient && credCheck.hasCredentials) {
    try {
      texasLivePayload = await fetchTexasSubAgentsLive(
        params.texasClient,
        params.ledgerDate,
        null
      );
      childrenCount = texasLivePayload.allChildrenRecords.length;
      statisticsCount = texasLivePayload.payload.agents.length;
      affiliateIdsDiscovered = texasLivePayload.allChildrenRecords
        .map((c) => normalizeAffiliateId(String(c.affiliateId ?? "")))
        .filter((id): id is string => Boolean(id));

      const transfers = await fetchAgentTransfers(params.texasClient, {
        paginate: true,
      });
      allTransferRecords = transfers.records;
      transfersRecordCount = transfers.records.length;

      subAgentReportAvailable = true;
    } catch (e) {
      texasAuthError = e instanceof Error ? e.message : String(e);
    }
  } else if (!credCheck.hasCredentials) {
    texasAuthError = "credentials_missing";
  }

  const { data: dbChildrenRaw } = await params.supabase
    .from("users")
    .select(
      "id, texas_affiliate_id, display_name, texas_username, role, is_active, parent_id"
    )
    .eq("parent_id", viewer.id)
    .eq("is_active", true);

  const dbChildren = (dbChildrenRaw ?? []) as Array<
    DirectChildDbRow & { parent_id: string }
  >;

  let repairResult: AgentDataAuditReport["repair"];
  if (params.repair && texasLivePayload && credCheck.hasCredentials) {
    const viewerAffiliateId = await resolveViewerTexasAffiliateId(
      params.supabase,
      viewer.id,
      viewerRow.texas_affiliate_id,
      texasLivePayload.texasParentByAffiliate
    );
    const linkableRefs = collectTexasChildrenForDbLink(
      texasLivePayload.allChildrenRecords,
      viewerAffiliateId
    );
    const linkResult = await ensureTexasPortalDirectChildrenInDb(
      params.supabase,
      viewer.id,
      linkableRefs
    );
    let syncedViaMaster = 0;
    const errors: string[] = [];
    try {
      const masterSync = await syncDirectChildrenViaMasterSession(
        params.supabase,
        viewer.id,
        params.ledgerDate
      );
      syncedViaMaster = masterSync.synced;
      if (masterSync.failed.length) {
        errors.push(...masterSync.failed.map((f) => `sync_failed:${f}`));
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
    repairResult = {
      linked: linkResult.created,
      synced_via_master: syncedViaMaster,
      errors,
    };
  }

  const { data: refreshedDb } = await params.supabase
    .from("users")
    .select(
      "id, texas_affiliate_id, display_name, texas_username, role, is_active, parent_id"
    )
    .eq("parent_id", viewer.id)
    .eq("is_active", true);

  const dbChildrenFinal = (refreshedDb ?? dbChildren) as Array<
    DirectChildDbRow & { parent_id: string }
  >;

  const texasPayload = texasLivePayload?.payload ?? {
    ledger_date: params.ledgerDate,
    fetched_at: new Date().toISOString(),
    agents: [],
    stats: {
      active_agents: 0,
      total_network_burn: 0,
      combined_balance: 0,
      highest_burn_agent: null,
    },
  };

  const { agents: mergedAgents } = mergeDirectChildrenWithTexas(
    dbChildrenFinal,
    texasPayload
  );

  const enriched = await enrichSubAgentsWithPerAgentData(
    params.supabase,
    viewer.id,
    mergedAgents,
    params.ledgerDate,
    { parentWhatsappVerified: false }
  );

  const texasAffiliateSet = new Set(affiliateIdsDiscovered);
  const childRows: AgentChildAuditRow[] = [];

  for (const agent of enriched.agents) {
    const aid = normalizeAffiliateId(agent.affiliateId);
    const issues: AgentAuditIssueReason[] = [];

    if (!aid) issues.push("missing_affiliate_id");
    if (!agent.user_id) issues.push("missing_db_user");

    const dbRow = dbChildrenFinal.find((c) => c.id === agent.user_id);
    const parentMatch = dbRow ? dbRow.parent_id === viewer.id : false;
    if (dbRow && !parentMatch) issues.push("wrong_parent_id");
    if (dbRow && !dbRow.is_active) issues.push("inactive_user");

    const texasPresent = aid ? texasAffiliateSet.has(aid) : false;
    if (!texasPresent && aid) issues.push("texas_not_returning_user");

    let hasSnapshot = false;
    let snapshotDep: number | null = null;
    let snapshotWd: number | null = null;
    if (agent.user_id) {
      const { data: snap } = await params.supabase
        .from("api_snapshots")
        .select("total_deposit, total_withdraw")
        .eq("user_id", agent.user_id)
        .eq("ledger_date", params.ledgerDate)
        .maybeSingle();
      if (snap) {
        hasSnapshot = true;
        snapshotDep = Number(snap.total_deposit);
        snapshotWd = Number(snap.total_withdraw);
      } else {
        issues.push("missing_api_snapshot");
      }
    }

    let ledgerTebat: number | null = null;
    let ledgerSuhoubat: number | null = null;
    let hasLedger = false;
    if (agent.user_id) {
      const { data: ledger } = await params.supabase
        .from("daily_ledgers")
        .select("tebat, suhoubat")
        .eq("user_id", agent.user_id)
        .eq("ledger_date", params.ledgerDate)
        .maybeSingle();
      if (ledger) {
        hasLedger = true;
        ledgerTebat = Number(ledger.tebat);
        ledgerSuhoubat = Number(ledger.suhoubat);
      } else {
        issues.push("missing_daily_ledger");
      }
    }

    let txDep = 0;
    let txWd = 0;
    if (aid && allTransferRecords.length > 0) {
      const attr = sumTransfersAttributedToAffiliate(allTransferRecords, aid);
      txDep = attr.totalDeposit;
      txWd = attr.totalWithdraw;
      console.info("[texas:transfers:child]", transferAttributionLogPayload(aid, allTransferRecords));
      if (attr.totalDeposit === 0 && attr.totalWithdraw === 0 && agent.has_live_texas_data) {
        issues.push("transfer_attribution_failed");
      }
    }

    let genDep: number | null = null;
    let genWd: number | null = null;
    let genNgr: number | null = null;
    if (params.texasClient && aid && credCheck.hasCredentials) {
      try {
        const report = await fetchSubAgentGeneralReport(params.texasClient, {
          affiliateId: aid,
        });
        if (report) {
          genDep = report.deposits;
          genWd = report.withdrawal;
          genNgr = report.ngr;
        }
      } catch {
        // reference only
      }
    }

    const { data: waGroup } = aid
      ? await params.supabase
          .from("whatsapp_agent_groups")
          .select("id")
          .eq("user_id", viewer.id)
          .eq("affiliate_id", aid)
          .eq("is_active", true)
          .maybeSingle()
      : { data: null };

    const monthKey = params.ledgerDate.slice(0, 7);
    const { data: commissionRow } = aid
      ? await params.supabase
          .from("monthly_agent_commissions")
          .select("id")
          .eq("parent_user_id", viewer.id)
          .eq("affiliate_id", aid)
          .eq("month_key", monthKey)
          .maybeSingle()
      : { data: null };

    if (agent.metrics_source === "empty_no_data" && agent.has_live_texas_data) {
      issues.push("fallback_to_zero");
    }
    if (
      agent.mtd &&
      agent.mtd.current_snapshot_found &&
      !agent.mtd.baseline_snapshot_found &&
      agent.metrics_source === "live_texas_fallback"
    ) {
      issues.push("missing_baseline_snapshot");
    }

    const recon = reconcileFinancialTotals({
      texasTxDeposit: txDep,
      texasTxWithdraw: txWd,
      snapshotDeposit: snapshotDep,
      snapshotWithdraw: snapshotWd,
      ledgerTebat,
      ledgerSuhoubat,
      displayedTebat: agent.metrics.tebat,
      displayedSuhoubat: agent.metrics.suhoubat,
      generalReportDeposit: genDep,
      generalReportWithdrawal: genWd,
    });

    if (recon.status === "ERROR") {
      if (!issues.includes("fallback_to_zero")) issues.push("unknown");
    }

    childRows.push({
      affiliate_id: aid ?? agent.affiliateId,
      user_id: agent.user_id ?? null,
      display_name: dbRow?.display_name ?? agent.username,
      texas_username: dbRow?.texas_username ?? null,
      parent_id_match: parentMatch,
      is_active: dbRow?.is_active ?? false,
      texas_present: texasPresent,
      db_present: Boolean(agent.user_id),
      linked_correctly: Boolean(agent.user_id && parentMatch && texasPresent),
      has_api_snapshot: hasSnapshot,
      has_daily_ledger: hasLedger,
      whatsapp_group_exists: Boolean(waGroup),
      commission_row_exists: Boolean(commissionRow),
      texas_tx_deposit: txDep,
      texas_tx_withdraw: txWd,
      general_report_deposits: genDep,
      general_report_withdrawal: genWd,
      general_report_ngr: genNgr,
      api_snapshot_total_deposit: snapshotDep,
      api_snapshot_total_withdraw: snapshotWd,
      daily_ledger_tebat: ledgerTebat,
      daily_ledger_suhoubat: ledgerSuhoubat,
      ui_tebat: agent.metrics.tebat,
      ui_suhoubat: agent.metrics.suhoubat,
      metrics_source: agent.metrics_source ?? null,
      reconciliation_status: recon.status,
      reconciliation_diff: recon.maxDifference,
      issues: recon.status === "OK" && issues.length === 0 ? [] : issues,
    });
  }

  // Texas portal children missing from DB
  if (texasLivePayload) {
    const viewerAffiliateId = await resolveViewerTexasAffiliateId(
      params.supabase,
      viewer.id,
      viewerRow.texas_affiliate_id,
      texasLivePayload.texasParentByAffiliate
    );
    const linkable = filterTexasPortalDirectChildren(
      texasLivePayload.allChildrenRecords,
      viewerAffiliateId
    );
    for (const ref of linkable) {
      const aid = normalizeAffiliateId(ref.affiliateId);
      if (!aid) continue;
      if (childRows.some((r) => r.affiliate_id === aid)) continue;
      childRows.push({
        affiliate_id: aid,
        user_id: null,
        display_name: ref.username ?? null,
        texas_username: ref.username ?? null,
        parent_id_match: false,
        is_active: false,
        texas_present: true,
        db_present: false,
        linked_correctly: false,
        has_api_snapshot: false,
        has_daily_ledger: false,
        whatsapp_group_exists: false,
        commission_row_exists: false,
        texas_tx_deposit: 0,
        texas_tx_withdraw: 0,
        general_report_deposits: null,
        general_report_withdrawal: null,
        general_report_ngr: null,
        api_snapshot_total_deposit: null,
        api_snapshot_total_withdraw: null,
        daily_ledger_tebat: null,
        daily_ledger_suhoubat: null,
        ui_tebat: null,
        ui_suhoubat: null,
        metrics_source: null,
        reconciliation_status: "ERROR",
        reconciliation_diff: 0,
        issues: ["missing_db_user"],
      });
    }
  }

  const summary = {
    missing_db_users: childRows.filter((r) => r.issues.includes("missing_db_user")).length,
    wrong_parent_users: childRows.filter((r) => r.issues.includes("wrong_parent_id")).length,
    missing_money_rows: childRows.filter((r) =>
      r.issues.some((i) =>
        ["missing_api_snapshot", "missing_daily_ledger", "fallback_to_zero", "transfer_attribution_failed"].includes(i)
      )
    ).length,
    fallback_to_zero_rows: childRows.filter((r) => r.issues.includes("fallback_to_zero")).length,
    ok_rows: childRows.filter((r) => r.reconciliation_status === "OK").length,
    warning_rows: childRows.filter((r) => r.reconciliation_status === "WARNING").length,
    error_rows: childRows.filter((r) => r.reconciliation_status === "ERROR").length,
  };

  return {
    generated_at: new Date().toISOString(),
    ledger_date: params.ledgerDate,
    viewer: {
      user_id: viewer.id,
      telegram_id: viewer.telegram_id,
      texas_username: viewerRow.texas_username,
      texas_affiliate_id: viewerRow.texas_affiliate_id,
      has_texas_credentials: credCheck.hasCredentials,
      subscription_active: subscriptionActive,
      role: viewerRow.role,
    },
    texas: {
      children_count: childrenCount,
      statistics_count: statisticsCount,
      transfers_record_count: transfersRecordCount,
      sub_agent_report_available: subAgentReportAvailable,
      affiliate_ids_discovered: affiliateIdsDiscovered,
      auth_error: texasAuthError,
    },
    supabase: {
      direct_children_count: dbChildrenFinal.length,
      children: childRows,
    },
    summary,
    repair: repairResult,
  };
}
