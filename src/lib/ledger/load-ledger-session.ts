import { mapLedgerRow } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AppUser,
  DailyLedger,
  LedgerSessionResponse,
  UserRole,
} from "@/lib/supabase/database.types";
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
  computeMonthlyCumulativeLedgerView,
} from "@/lib/accounting/monthly-ledger-view";
import { resolveMonthStart } from "@/lib/accounting/monthly-ledger-view";

export interface LedgerSessionOptions {
  /** Force Texas sync for target user even if ledger is fresh */
  forceSync?: boolean;
  /** Refresh stale ledgers for network members (agents tab) */
  syncNetwork?: boolean;
  /** UI-only view behavior (does not persist changes) */
  viewMode?: "daily" | "monthly";
}

import type { LedgerSyncMeta } from "@/lib/supabase/database.types";

export async function loadLedgerForUser(
  supabase: SupabaseClient,
  userId: string,
  ledgerDate: string,
  viewMode: "daily" | "monthly" = "daily"
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
  if (viewMode !== "monthly") return ledger;

  const monthStart = resolveMonthStart(ledger.ledger_date);

  const { data: mtdRows } = await supabase
    .from("daily_ledgers")
    .select("tebat,suhoubat,wasel_menho,wasel_eleih")
    .eq("user_id", userId)
    .gte("ledger_date", monthStart)
    .lte("ledger_date", ledgerDate);

  const { data: prevClosed } = await supabase
    .from("daily_ledgers")
    .select("al_nihai")
    .eq("user_id", userId)
    .eq("status", "closed")
    .lt("ledger_date", monthStart)
    .order("ledger_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prevCarry = Number(prevClosed?.al_nihai ?? 0);

  const monthly = computeMonthlyCumulativeLedgerView({
    ledgerDate,
    rowsFromMonthStartInclusive: (mtdRows ?? []) as Array<{
      tebat: number | string | null;
      suhoubat: number | string | null;
      wasel_menho: number | string | null;
      wasel_eleih: number | string | null;
    }>,
    baqiQadimFixedCarry: prevCarry,
  });

  ledger.tebat = monthly.tebatMtd;
  ledger.suhoubat = monthly.suhoubatMtd;
  ledger.al_farq = monthly.alFarqMtd;
  ledger.al_harq = monthly.alHarqMtd;
  ledger.wasel_menho = monthly.waselMenhoMtd;
  ledger.wasel_eleih = monthly.waselEleihMtd;
  ledger.baqi_qadim = monthly.baqiQadimMtd;
  ledger.al_nihai = monthly.alNihaiMtd;
  ledger.discrepancy_flag = monthly.discrepancyFlag;

  return ledger;
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
      memberIds,
      ledgerDate
    );
    networkSynced = batch.synced;
  }

  const ledger = await loadLedgerForUser(
    supabase,
    viewUserId,
    ledgerDate,
    options?.viewMode ?? "daily"
  );

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
    sync_meta: {
      target_user_id: viewUserId,
      synced: syncResult.synced,
      reason: syncResult.reason,
      network_synced: networkSynced,
    },
  };
}
