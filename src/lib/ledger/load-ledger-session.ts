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

export async function loadLedgerForUser(
  supabase: SupabaseClient,
  userId: string,
  ledgerDate: string
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
  return ledgerRow ? mapLedgerRow(ledgerRow) : null;
}

export async function buildLedgerSession(
  supabase: SupabaseClient,
  user: AppUser,
  subscriptionActive: boolean,
  ledgerDate: string,
  agentId?: string | null
): Promise<LedgerSessionResponse> {
  if (!subscriptionActive) {
    return {
      user,
      ledger: null,
      subscription_active: false,
    };
  }

  const viewUserId = agentId?.trim() || user.id;
  if (viewUserId !== user.id) {
    await assertCanViewUser(supabase, user.id, viewUserId);
  }

  const ledger = await loadLedgerForUser(supabase, viewUserId, ledgerDate);

  const { data: profile } = await supabase
    .from("users")
    .select("parent_id, role")
    .eq("id", user.id)
    .maybeSingle();

  const role = (profile?.role ?? user.role) as UserRole;
  const isViewingSelf = viewUserId === user.id;

  let network;
  let hierarchy;

  if (isViewingSelf && canManageNetwork(role)) {
    network = await fetchNetworkPayload(supabase, user.id, role, ledgerDate);
    if (network.members.length > 0) {
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
  };
}
