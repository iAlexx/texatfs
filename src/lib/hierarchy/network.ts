import type { SupabaseClient } from "@supabase/supabase-js";
import { mapLedgerRow } from "@/lib/supabase/client";
import type { DailyLedger, UserRole } from "@/lib/supabase/database.types";
import type {
  AgentLedgerSummary,
  NetworkMember,
  NetworkPayload,
  NetworkStats,
} from "@/lib/hierarchy/types";

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
    .select(
      "id, user_id, ledger_date, status, tebat, suhoubat, al_farq, al_harq, wasel_menho, wasel_eleih, baqi_qadim, al_nihai, discrepancy_flag, updated_at"
    )
    .in("user_id", userIds)
    .eq("ledger_date", ledgerDate);

  if (error) throw error;

  return new Map(
    (data ?? []).map((row) => [row.user_id as string, mapLedgerRow(row)])
  );
}

async function fetchDescendantMembers(
  supabase: SupabaseClient,
  rootId: string
): Promise<Array<{ id: string; depth: number }>> {
  const { data, error } = await supabase.rpc("get_descendant_user_ids", {
    p_root_id: rootId,
  });

  if (error) throw error;

  return (data ?? []).map((row: { id: string; depth: number }) => ({
    id: row.id,
    depth: row.depth,
  }));
}

async function fetchDirectChildren(
  supabase: SupabaseClient,
  parentId: string
): Promise<Array<{ id: string; depth: number }>> {
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("parent_id", parentId)
    .eq("is_active", true)
    .order("display_name", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((u) => ({ id: u.id as string, depth: 1 }));
}

function computeStats(
  members: NetworkMember[],
  ownLedger: AgentLedgerSummary | null
): NetworkStats {
  const players = members.filter((m) => m.role === "player");
  const active_agents = players.filter((m) => m.is_active).length;

  let combined_balance = ownLedger?.al_nihai ?? 0;
  let total_network_burn = ownLedger?.al_harq ?? 0;

  let highest: NetworkStats["highest_burn_agent"] = null;

  for (const m of members) {
    if (m.ledger) {
      combined_balance += m.ledger.al_nihai;
      total_network_burn += m.ledger.al_harq;
      if (
        !highest ||
        m.ledger.al_harq > highest.al_harq
      ) {
        highest = {
          id: m.id,
          name: m.display_name ?? m.texas_username ?? "—",
          al_harq: m.ledger.al_harq,
        };
      }
    }
  }

  if (ownLedger && (!highest || ownLedger.al_harq > highest.al_harq)) {
    highest = {
      id: "self",
      name: "حسابي",
      al_harq: ownLedger.al_harq,
    };
  }

  return {
    active_agents,
    combined_balance,
    total_network_burn,
    highest_burn_agent: highest && highest.id !== "self" ? highest : highest,
  };
}

export async function fetchNetworkPayload(
  supabase: SupabaseClient,
  viewerId: string,
  viewerRole: UserRole,
  ledgerDate: string
): Promise<NetworkPayload> {
  const descendantRefs =
    viewerRole === "super_master"
      ? await fetchDescendantMembers(supabase, viewerId)
      : viewerRole === "master"
        ? await fetchDirectChildren(supabase, viewerId)
        : [];

  const ids = descendantRefs.map((d) => d.id);
  const depthById = new Map(descendantRefs.map((d) => [d.id, d.depth]));

  const { data: users, error: usersError } = ids.length
    ? await supabase
        .from("users")
        .select("id, display_name, texas_username, role, parent_id, is_active")
        .in("id", ids)
    : { data: [], error: null };

  if (usersError) throw usersError;

  const ledgerByUser = await loadLedgersForUsers(supabase, ids, ledgerDate);

  const { data: ownRow } = await supabase
    .from("daily_ledgers")
    .select(
      "id, user_id, ledger_date, status, tebat, suhoubat, al_farq, al_harq, wasel_menho, wasel_eleih, baqi_qadim, al_nihai, discrepancy_flag, updated_at"
    )
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
        role: u.role as UserRole,
        parent_id: u.parent_id,
        depth: depthById.get(u.id) ?? 1,
        is_active: u.is_active,
        ledger: full ? toAgentSummary(full) : null,
      };
    })
    .sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth;
      if (a.role !== b.role) {
        const order = { super_master: 0, master: 1, player: 2 };
        return (order[a.role] ?? 9) - (order[b.role] ?? 9);
      }
      return (a.display_name ?? a.texas_username ?? "").localeCompare(
        b.display_name ?? b.texas_username ?? "",
        "ar"
      );
    });

  const stats = computeStats(members, ownLedger);

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
      agent_count: subAgents.filter((a) => a.role === "player").length,
    },
    sub_agents: subAgents,
  };
}
