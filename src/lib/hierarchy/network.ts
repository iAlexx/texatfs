import type { SupabaseClient } from "@supabase/supabase-js";
import { mapLedgerRow } from "@/lib/supabase/client";
import type { DailyLedger, UserRole } from "@/lib/supabase/database.types";
import type {
  AgentLedgerSummary,
  NetworkMember,
  NetworkPayload,
  NetworkStats,
} from "@/lib/hierarchy/types";
import {
  compareNetworkMembers,
  filterMembersForSubAgentsTab,
  isCountableNetworkMember,
} from "@/lib/hierarchy/subtree-rules";

const LEDGER_SELECT =
  "id, user_id, ledger_date, status, tebat, suhoubat, al_farq, al_harq, wasel_menho, wasel_eleih, baqi_qadim, al_nihai, discrepancy_flag, updated_at";

function toAgentSummary(ledger: DailyLedger | null): AgentLedgerSummary | null {
  if (!ledger) return null;
  return {
    id: ledger.id,
    ledger_date: ledger.ledger_date,
    status: ledger.status,
    tebat: ledger.tebat,
    suhoubat: ledger.suhoubat,
    al_farq: ledger.al_farq,
    al_harq: ledger.al_harq,
    wasel_menho: ledger.wasel_menho,
    wasel_eleih: ledger.wasel_eleih,
    baqi_qadim: ledger.baqi_qadim,
    al_nihai: ledger.al_nihai,
    discrepancy_flag: ledger.discrepancy_flag,
  };
}

async function loadLedgersForUsers(
  supabase: SupabaseClient,
  userIds: string[],
  ledgerDate: string
): Promise<Map<string, DailyLedger>> {
  if (!userIds.length) return new Map();

  const { data, error } = await supabase
    .from("daily_ledgers")
    .select(LEDGER_SELECT)
    .in("user_id", userIds)
    .eq("ledger_date", ledgerDate);

  if (error) throw error;

  return new Map(
    (data ?? []).map((row) => [row.user_id as string, mapLedgerRow(row)])
  );
}

/** Full recursive subtree via Phase 7 RPC */
async function fetchDescendantMembers(
  supabase: SupabaseClient,
  rootId: string
): Promise<Array<{ id: string; depth: number }>> {
  const { data, error } = await supabase.rpc("get_descendant_user_ids", {
    p_root_id: rootId,
  });

  if (error) {
    console.error("[hierarchy] get_descendant_user_ids failed", {
      rootId,
      message: error.message,
    });
    throw error;
  }

  return (data ?? []).map((row: { id: string; depth: number }) => ({
    id: row.id,
    depth: row.depth,
  }));
}

function computeStats(
  viewerRole: UserRole,
  viewerId: string,
  members: NetworkMember[],
  ownLedger: AgentLedgerSummary | null
): NetworkStats {
  const visible = filterMembersForSubAgentsTab(viewerRole, members, viewerId);
  const active_agents = visible.filter(
    (m) => m.is_active && isCountableNetworkMember(viewerRole, m)
  ).length;

  let combined_balance = ownLedger?.al_nihai ?? 0;
  let total_network_burn = ownLedger?.al_harq ?? 0;

  let highest: NetworkStats["highest_burn_agent"] = null;

  for (const m of visible) {
    if (!m.ledger) continue;
    combined_balance += m.ledger.al_nihai;
    total_network_burn += m.ledger.al_harq;
    if (!highest || m.ledger.al_harq > highest.al_harq) {
      highest = {
        id: m.id,
        name: m.display_name ?? m.texas_username ?? "—",
        al_harq: m.ledger.al_harq,
      };
    }
  }

  return {
    active_agents,
    combined_balance,
    total_network_burn,
    highest_burn_agent: highest,
  };
}

export async function fetchNetworkPayload(
  supabase: SupabaseClient,
  viewerId: string,
  viewerRole: UserRole,
  ledgerDate: string
): Promise<NetworkPayload> {
  const descendantRefs =
    viewerRole === "super_master" ||
    viewerRole === "master" ||
    viewerRole === "agent"
      ? await fetchDescendantMembers(supabase, viewerId)
      : [];

  const ids = descendantRefs.map((d) => d.id);
  const depthById = new Map(descendantRefs.map((d) => [d.id, d.depth]));

  const { data: users, error: usersError } = ids.length
    ? await supabase
        .from("users")
        .select(
          "id, display_name, texas_username, telegram_id, role, parent_id, is_active"
        )
        .in("id", ids)
    : { data: [], error: null };

  if (usersError) throw usersError;

  const ledgerByUser = await loadLedgersForUsers(supabase, ids, ledgerDate);

  const { data: ownRow } = await supabase
    .from("daily_ledgers")
    .select(LEDGER_SELECT)
    .eq("user_id", viewerId)
    .eq("ledger_date", ledgerDate)
    .maybeSingle();

  const ownLedger = ownRow ? toAgentSummary(mapLedgerRow(ownRow)) : null;

  const members: NetworkMember[] = (users ?? [])
    .filter((u) => u.is_active !== false)
    .map((u) => {
      const full = ledgerByUser.get(u.id);
      return {
        id: u.id,
        display_name: u.display_name,
        texas_username: u.texas_username,
        telegram_id: u.telegram_id ?? null,
        role: u.role as UserRole,
        parent_id: u.parent_id,
        depth: depthById.get(u.id) ?? 1,
        is_active: u.is_active,
        ledger: full ? toAgentSummary(full) : null,
      };
    })
    .sort(compareNetworkMembers);

  const stats = computeStats(viewerRole, viewerId, members, ownLedger);

  return {
    viewer_id: viewerId,
    viewer_role: viewerRole,
    ledger_date: ledgerDate,
    stats,
    members,
    own_ledger: ownLedger,
  };
}

/** Back-compat for hero + legacy hierarchy consumers */
export async function fetchSubAgentsWithLedgers(
  supabase: SupabaseClient,
  parentUserId: string,
  ledgerDate: string
) {
  const { data: parent } = await supabase
    .from("users")
    .select("role")
    .eq("id", parentUserId)
    .single();

  const network = await fetchNetworkPayload(
    supabase,
    parentUserId,
    (parent?.role ?? "master") as UserRole,
    ledgerDate
  );

  return network.members.map((m) => ({
    id: m.id,
    display_name: m.display_name,
    texas_username: m.texas_username,
    role: m.role,
    ledger: m.ledger,
  }));
}

export function buildHierarchyPayload(
  subAgents: Awaited<ReturnType<typeof fetchSubAgentsWithLedgers>>,
  ownLedger: DailyLedger | null
) {
  const own = toAgentSummary(ownLedger);
  let totalBurn = own?.al_harq ?? 0;
  let totalAlNihai = own?.al_nihai ?? 0;

  for (const agent of subAgents) {
    if (agent.ledger) {
      totalBurn += agent.ledger.al_harq;
      totalAlNihai += agent.ledger.al_nihai;
    }
  }

  return {
    consolidated: {
      total_burn: totalBurn,
      total_al_nihai: totalAlNihai,
      agent_count: subAgents.filter(
        (a) => a.role === "player" || a.role === "agent"
      ).length,
    },
    sub_agents: subAgents,
  };
}
