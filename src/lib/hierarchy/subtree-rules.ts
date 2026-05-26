import type { NetworkMember } from "@/lib/hierarchy/types";
import type { UserRole } from "@/lib/supabase/database.types";

/** Roles that can open the sub-agents tab and network APIs */
export function canManageNetwork(role: string): boolean {
  return (
    role === "super_master" ||
    role === "master" ||
    role === "agent"
  );
}

/**
 * Direct-Only privacy: only immediate children of the viewer are visible.
 * The member list is already restricted to direct children by the data layer,
 * but we enforce the parent_id check here as a defence-in-depth guard.
 */
export function filterMembersForSubAgentsTab(
  _viewerRole: UserRole,
  members: NetworkMember[],
  viewerId: string
): NetworkMember[] {
  return members.filter((m) => m.id !== viewerId && m.parent_id === viewerId);
}

/** Roles used when counting "active agents" in network stats */
export function isCountableNetworkMember(
  viewerRole: UserRole,
  member: NetworkMember
): boolean {
  if (viewerRole === "agent") {
    return member.role === "player";
  }
  return member.role !== "super_master";
}

const ROLE_SORT: Record<string, number> = {
  master: 1,
  agent: 2,
  player: 3,
  super_master: 0,
};

export function compareNetworkMembers(a: NetworkMember, b: NetworkMember): number {
  if (a.depth !== b.depth) return a.depth - b.depth;
  const ra = ROLE_SORT[a.role] ?? 9;
  const rb = ROLE_SORT[b.role] ?? 9;
  if (ra !== rb) return ra - rb;
  return (a.display_name ?? a.texas_username ?? "").localeCompare(
    b.display_name ?? b.texas_username ?? "",
    "ar"
  );
}
