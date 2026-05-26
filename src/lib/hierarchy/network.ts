import type { SupabaseClient } from "@supabase/supabase-js";
import { mapLedgerRow } from "@/lib/supabase/client";
import type { DailyLedger, UserRole } from "@/lib/supabase/database.types";
import type {
  AgentLedgerSummary,
  NetworkMember,
  NetworkMemberSnapshot,
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

async function loadLatestSnapshots(
  supabase: SupabaseClient,
  userIds: string[],
  ledgerDate: string
): Promise<Map<string, NetworkMemberSnapshot>> {
  if (!userIds.length) return new Map();

  const { data, error } = await supabase
    .from("api_snapshots")
    .select("user_id, balance, total_deposit, total_withdraw")
    .in("user_id", userIds)
    .eq("ledger_date", ledgerDate)
    .order("captured_at", { ascending: false });

  if (error || !data) return new Map();

  const map = new Map<string, NetworkMemberSnapshot>();
  for (const row of data) {
    const uid = row.user_id as string;
    if (map.has(uid)) continue;
    map.set(uid, {
      balance: Number(row.balance),
      total_deposit: Number(row.total_deposit),
      total_withdraw: Number(row.total_withdraw),
    });
  }
  return map;
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
    console.error("[hierarchy] get_descendant_user_ids RPC failed — will fall back to direct query", {
      rootId,
      code: error.code,
      message: error.message,
    });
    return [];
  }

  if (!data || !Array.isArray(data)) {
    console.warn("[hierarchy] get_descendant_user_ids returned non-array", {
      rootId,
      dataType: typeof data,
      isNull: data === null,
    });
    return [];
  }

  return data.map((row: { id: string; depth: number }) => ({
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

export interface FetchNetworkOptions {
  /** Only return direct children (depth=1) instead of full subtree */
  directOnly?: boolean;
}

export async function fetchNetworkPayload(
  supabase: SupabaseClient,
  viewerId: string,
  viewerRole: UserRole,
  ledgerDate: string,
  options?: FetchNetworkOptions
): Promise<NetworkPayload> {
  const directOnly = options?.directOnly ?? true;

  let ids: string[];
  let depthById: Map<string, number>;

  if (directOnly) {
    const { data: directChildren, error: dcErr } = await supabase
      .from("users")
      .select("id")
      .eq("parent_id", viewerId)
      .eq("is_active", true);

    if (dcErr) throw dcErr;

    ids = (directChildren ?? []).map((u) => u.id);
    depthById = new Map(ids.map((id) => [id, 1]));

    console.info("[network] directOnly query", {
      viewerId,
      viewerRole,
      childrenFound: ids.length,
      firstIds: ids.slice(0, 3),
    });
  } else {
    // Try recursive RPC first
    let descendantRefs: Array<{ id: string; depth: number }> = [];

    if (
      viewerRole === "super_master" ||
      viewerRole === "master" ||
      viewerRole === "agent"
    ) {
      descendantRefs = await fetchDescendantMembers(supabase, viewerId);
    }

    console.info("[network] RPC get_descendant_user_ids result", {
      viewerId,
      viewerRole,
      descendantsFromRpc: descendantRefs.length,
      firstIds: descendantRefs.slice(0, 3).map((d) => d.id),
    });

    // Fallback: if RPC returned 0 descendants, try direct parent_id query
    if (descendantRefs.length === 0) {
      const { data: directFallback, error: fbErr } = await supabase
        .from("users")
        .select("id")
        .eq("parent_id", viewerId);

      if (!fbErr && directFallback && directFallback.length > 0) {
        console.info("[network] RPC returned 0 but direct parent_id query found children — using fallback", {
          viewerId,
          fallbackCount: directFallback.length,
          firstIds: directFallback.slice(0, 3).map((u) => u.id),
        });
        descendantRefs = directFallback.map((u) => ({ id: u.id, depth: 1 }));
      }
    }

    ids = descendantRefs.map((d) => d.id);
    depthById = new Map(descendantRefs.map((d) => [d.id, d.depth]));
  }

  const { data: users, error: usersError } = ids.length
    ? await supabase
        .from("users")
        .select(
          "id, display_name, texas_username, texas_affiliate_id, telegram_id, role, parent_id, is_active"
        )
        .in("id", ids)
    : { data: [], error: null };

  if (usersError) throw usersError;

  console.info("[network] users loaded", {
    viewerId,
    directOnly,
    idsCount: ids.length,
    usersReturned: (users ?? []).length,
    activeUsers: (users ?? []).filter((u) => u.is_active !== false).length,
    firstUsers: (users ?? []).slice(0, 3).map((u) => ({
      id: u.id,
      role: u.role,
      parent_id: u.parent_id,
      name: u.display_name ?? u.texas_username,
    })),
  });

  const [ledgerByUser, snapshotByUser] = await Promise.all([
    loadLedgersForUsers(supabase, ids, ledgerDate),
    loadLatestSnapshots(supabase, ids, ledgerDate),
  ]);

  const [{ data: ownRow }, childCountMap] = await Promise.all([
    supabase
      .from("daily_ledgers")
      .select(LEDGER_SELECT)
      .eq("user_id", viewerId)
      .eq("ledger_date", ledgerDate)
      .maybeSingle(),
    directOnly
      ? loadDirectChildrenCounts(supabase, ids)
      : computeChildCountsFromList(users ?? [], viewerId),
  ]);

  const ownLedger = ownRow ? toAgentSummary(mapLedgerRow(ownRow)) : null;

  const members: NetworkMember[] = (users ?? [])
    .filter((u) => u.is_active !== false)
    .map((u) => ({
      id: u.id,
      display_name: u.display_name,
      texas_username: u.texas_username,
      texas_affiliate_id: u.texas_affiliate_id ?? null,
      telegram_id: u.telegram_id ?? null,
      role: u.role as UserRole,
      parent_id: u.parent_id,
      depth: depthById.get(u.id) ?? 1,
      is_active: u.is_active,
      ledger: ledgerByUser.has(u.id)
        ? toAgentSummary(ledgerByUser.get(u.id)!)
        : null,
      snapshot: snapshotByUser.get(u.id) ?? null,
      direct_children_count: childCountMap.get(u.id) ?? 0,
    }))
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

async function computeChildCountsFromList(
  users: Array<{ id: string; parent_id: string | null; is_active: boolean }>,
  viewerId: string
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const u of users) {
    if (!u.is_active || !u.parent_id) continue;
    const pid = u.parent_id;
    counts.set(pid, (counts.get(pid) ?? 0) + 1);
  }
  // Also count direct children of the viewer (they're in the list with parent_id = viewerId)
  void viewerId;
  return counts;
}

async function loadDirectChildrenCounts(
  supabase: SupabaseClient,
  parentIds: string[]
): Promise<Map<string, number>> {
  if (!parentIds.length) return new Map();

  const { data, error } = await supabase
    .from("users")
    .select("parent_id")
    .in("parent_id", parentIds)
    .eq("is_active", true);

  if (error) return new Map();

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const pid = row.parent_id as string;
    counts.set(pid, (counts.get(pid) ?? 0) + 1);
  }
  return counts;
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
