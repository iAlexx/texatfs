import { mapLedgerRow } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AppUser,
  DailyLedger,
  LedgerSessionResponse,
  TexasPanelSnapshot,
  UserRole,
} from "@/lib/supabase/database.types";
import type { TexasDashboardGeneral } from "@/lib/texas/types";
import { assertCanViewUser, canManageNetwork } from "@/lib/hierarchy/access";
import {
  buildHierarchyPayload,
  fetchNetworkPayload,
} from "@/lib/hierarchy/network";
import {
  ensureFreshLedgerForUser,
  refreshStaleSubtreeLedgers,
} from "@/lib/scraper/ensure-user-ledger-sync";
import {
  applyMtdMetricsToLedger,
  computeMtdLedgerMetricsForUser,
} from "@/lib/accounting/mtd-ledger-metrics";

export interface LedgerSessionOptions {
  /** Force Texas sync for target user even if ledger is fresh */
  forceSync?: boolean;
  /** Refresh stale ledgers for network members (agents tab) */
  syncNetwork?: boolean;
  /** `monthly` = MTD cumulative (default). `daily` = single-day delta row. */
  viewMode?: "daily" | "monthly";
}

import type { LedgerSyncMeta } from "@/lib/supabase/database.types";

export async function loadLedgerForUser(
  supabase: SupabaseClient,
  userId: string,
  ledgerDate: string,
  viewMode: "daily" | "monthly" = "monthly"
): Promise<DailyLedger | null> {
  const { data: ledgerRow, error } = await supabase
    .from("daily_ledgers")
    .select(
      "id, user_id, ledger_date, status, tebat, suhoubat, al_farq, al_harq, wasel_menho, wasel_eleih, baqi_qadim, al_nihai, discrepancy_flag, updated_at"
    )
    .eq("user_id", userId)
    .eq("ledger_date", ledgerDate)
    .maybeSingle();

  if (error) throw error;
  if (!ledgerRow) return null;

  const ledger = mapLedgerRow(ledgerRow);
  if (viewMode === "daily") return ledger;

  const mtd = await computeMtdLedgerMetricsForUser(
    supabase,
    userId,
    ledger.ledger_date
  );
  return applyMtdMetricsToLedger(ledger, mtd);
}

async function loadTexasPanelSnapshot(
  supabase: SupabaseClient,
  userId: string,
  ledgerDate: string,
  ledger: DailyLedger | null
): Promise<TexasPanelSnapshot | null> {
  const { data: snap, error } = await supabase
    .from("api_snapshots")
    .select("total_deposit, total_withdraw, ngr, raw_statistics")
    .eq("user_id", userId)
    .eq("ledger_date", ledgerDate)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !snap) return null;

  const raw = (snap.raw_statistics ?? {}) as Record<string, unknown>;
  const dg = raw.dashboardGeneral as TexasDashboardGeneral | undefined;

  return {
    daily_movement: ledger
      ? {
          tebat: ledger.tebat,
          suhoubat: ledger.suhoubat,
          al_farq: ledger.al_farq,
          al_harq: ledger.al_harq,
        }
      : null,
    transaction_cumulative: {
      deposits: Number(snap.total_deposit),
      withdrawals: Number(snap.total_withdraw),
    },
    dashboard_general: dg
      ? {
          deposits: dg.deposits,
          withdrawal: dg.withdrawal,
          ngr: dg.ngr,
          commission: dg.commission,
          agentId: dg.agentId,
          parentId: dg.parentId,
          username: dg.username,
        }
      : null,
  };
}

export async function buildLedgerSession(
  supabase: SupabaseClient,
  user: AppUser,
  subscriptionActive: boolean,
  ledgerDate: string,
  targetUserId?: string | null,
  options?: LedgerSessionOptions
): Promise<LedgerSessionResponse & { sync_meta?: LedgerSyncMeta }> {
  if (!subscriptionActive) {
    return {
      user,
      ledger: null,
      subscription_active: false,
    };
  }

  const viewUserId = targetUserId?.trim() || user.id;
  if (viewUserId !== user.id) {
    await assertCanViewUser(supabase, user.id, viewUserId);
  }

  const syncResult = await ensureFreshLedgerForUser(
    supabase,
    viewUserId,
    ledgerDate,
    { force: options?.forceSync }
  );

  const { data: profile } = await supabase
    .from("users")
    .select("parent_id, role")
    .eq("id", user.id)
    .maybeSingle();

  const role = (profile?.role ?? user.role) as UserRole;

  let networkSynced = 0;
  if (canManageNetwork(role) && options?.syncNetwork) {
    const { data: directChildren } = await supabase
      .from("users")
      .select("id")
      .eq("parent_id", user.id)
      .eq("is_active", true);
    const memberIds = (directChildren ?? []).map(
      (r) => r.id as string
    );
    const batch = await refreshStaleSubtreeLedgers(
      supabase,
      user.id,
      memberIds,
      ledgerDate,
      { force: options?.forceSync }
    );
    networkSynced = batch.synced;
  }

  const ledger = await loadLedgerForUser(
    supabase,
    viewUserId,
    ledgerDate,
    options?.viewMode ?? "monthly"
  );

  let monthly_commission: LedgerSessionResponse["monthly_commission"];
  if (ledger && (options?.viewMode ?? "monthly") === "monthly") {
    const monthKey = ledger.ledger_date.slice(0, 7);
    const { data: commissionRow } = await supabase
      .from("monthly_agent_commissions")
      .select(
        "month_key, burn_amount, percent, commission_amount, final_before_commission, final_after_commission, status"
      )
      .eq("agent_user_id", viewUserId)
      .eq("month_key", monthKey)
      .maybeSingle();

    if (commissionRow) {
      monthly_commission = {
        month_key: String(commissionRow.month_key),
        burn_amount: Number(commissionRow.burn_amount),
        percent:
          commissionRow.percent != null ? Number(commissionRow.percent) : null,
        commission_amount:
          commissionRow.commission_amount != null
            ? Number(commissionRow.commission_amount)
            : null,
        final_before_commission: Number(commissionRow.final_before_commission),
        final_after_commission:
          commissionRow.final_after_commission != null
            ? Number(commissionRow.final_after_commission)
            : null,
        status: String(commissionRow.status),
      };

      if (
        commissionRow.status === "completed" &&
        commissionRow.final_after_commission != null &&
        ledger
      ) {
        ledger.al_nihai = Number(commissionRow.final_after_commission);
      }
    }
  }

  let network;
  let hierarchy;

  if (canManageNetwork(role)) {
    network = await fetchNetworkPayload(supabase, user.id, role, ledgerDate);
    const isViewingSelf = viewUserId === user.id;
    if (isViewingSelf && network.members.length > 0) {
      hierarchy = buildHierarchyPayload(
        network.members.map((m) => ({
          id: m.id,
          display_name: m.display_name,
          texas_username: m.texas_username,
          role: m.role,
          ledger: m.ledger,
        })),
        ledger
      );
    }
  }

  const isTenantMaster =
    role === "master" &&
    (profile?.parent_id == null || (hierarchy?.sub_agents.length ?? 0) > 0);

  const texas_panel = await loadTexasPanelSnapshot(
    supabase,
    viewUserId,
    ledgerDate,
    ledger
  );

  return {
    user: {
      ...user,
      parent_id: profile?.parent_id ?? null,
      is_tenant_master: isTenantMaster,
    },
    ledger,
    subscription_active: true,
    hierarchy,
    network,
    viewing_user_id: viewUserId,
    view_mode: options?.viewMode ?? "monthly",
    monthly_commission,
    texas_panel,
    sync_meta: {
      target_user_id: viewUserId,
      synced: syncResult.synced,
      reason: syncResult.reason,
      network_synced: networkSynced,
    },
  };
}
