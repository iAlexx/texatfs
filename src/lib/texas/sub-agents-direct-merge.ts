import type { TexasSubAgentRow, TexasSubAgentsPayload } from "@/lib/texas/texas-live-sub-agents";
import type { TexasLiveLedgerMetrics } from "@/lib/texas/texas-live-ledger";

/** DB row used as the sole visibility source of truth */
export interface DirectChildDbRow {
  id: string;
  texas_affiliate_id: string | null;
  display_name: string | null;
  texas_username: string | null;
  role: string | null;
  is_active: boolean;
}

export const ZERO_METRICS: TexasLiveLedgerMetrics = {
  tebat: 0,
  suhoubat: 0,
  al_farq: 0,
  al_harq: 0,
  wasel_menho: 0,
  wasel_eleih: 0,
  baqi_qadim: 0,
  al_nihai: 0,
};

/** Normalize affiliate IDs for stable Texas ↔ DB matching */
export function normalizeAffiliateId(
  id: string | null | undefined
): string | null {
  if (id == null) return null;
  const s = String(id).trim();
  return s.length > 0 ? s : null;
}

/** Build lookup map from Texas payload rows (normalized keys) */
export function indexTexasAgentsByAffiliate(
  texasAgents: TexasSubAgentRow[]
): Map<string, TexasSubAgentRow> {
  const map = new Map<string, TexasSubAgentRow>();
  for (const agent of texasAgents) {
    const key = normalizeAffiliateId(agent.affiliateId);
    if (key && !map.has(key)) {
      map.set(key, { ...agent, has_live_texas_data: true });
    }
  }
  return map;
}

export function findTexasAgentRow(
  map: Map<string, TexasSubAgentRow>,
  affiliateId: string | null | undefined
): TexasSubAgentRow | undefined {
  const norm = normalizeAffiliateId(affiliateId);
  if (!norm) return undefined;
  const direct = map.get(norm);
  if (direct) return direct;
  for (const [key, row] of map) {
    if (key === norm || normalizeAffiliateId(key) === norm) {
      return row;
    }
  }
  return undefined;
}

function normalizeLogin(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim().toLowerCase();
}

export interface ViewerIdentity {
  userId: string;
  texasAffiliateId: string | null;
  texasUsername: string | null;
  displayName: string | null;
  email?: string | null;
}

/** True when a DB direct-child row is the viewer's own account (must not appear in Sub-Agents). */
export function isDirectChildViewerSelf(
  child: DirectChildDbRow,
  viewer: ViewerIdentity
): boolean {
  if (child.id === viewer.userId) return true;

  const childAid = normalizeAffiliateId(child.texas_affiliate_id);
  const viewerAid = normalizeAffiliateId(viewer.texasAffiliateId);
  if (childAid && viewerAid && childAid === viewerAid) return true;

  const viewerLogin = normalizeLogin(viewer.texasUsername);
  const childLogin = normalizeLogin(child.texas_username);
  if (viewerLogin && childLogin && viewerLogin === childLogin) return true;

  return false;
}

export function filterOutViewerSelfChildren(
  dbChildren: DirectChildDbRow[],
  viewer: ViewerIdentity
): DirectChildDbRow[] {
  return dbChildren.filter((child) => !isDirectChildViewerSelf(child, viewer));
}

/**
 * Match DB child to Texas enrichment by affiliateId, then by texas_username/email.
 */
export function findTexasRowForDbChild(
  texasByAffiliate: Map<string, TexasSubAgentRow>,
  texasAgents: TexasSubAgentRow[],
  dbChild: DirectChildDbRow
): TexasSubAgentRow | undefined {
  const byId = findTexasAgentRow(
    texasByAffiliate,
    dbChild.texas_affiliate_id
  );
  if (byId) return byId;

  const dbLogin = normalizeLogin(
    dbChild.texas_username ?? dbChild.display_name
  );
  if (!dbLogin) return undefined;

  for (const agent of texasAgents) {
    const email = normalizeLogin(agent.email);
    const username = normalizeLogin(agent.username);
    if (email === dbLogin || username === dbLogin) {
      return agent;
    }
  }

  return undefined;
}

export interface MergeDirectChildrenResult {
  agents: TexasSubAgentRow[];
  stats: TexasSubAgentsPayload["stats"];
  diagnostics: {
    dbDirectChildren: number;
    childrenWithAffiliateId: number;
    texasRowsTotal: number;
    matchedEnriched: number;
    stubCount: number;
    droppedTexasRows: number;
  };
}

function roundAgg(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export function computeSubAgentStats(
  agents: TexasSubAgentRow[]
): TexasSubAgentsPayload["stats"] {
  let totalBurn = 0;
  let combinedBalance = 0;
  let highest: TexasSubAgentsPayload["stats"]["highest_burn_agent"] = null;

  for (const a of agents) {
    totalBurn += a.metrics.al_harq;
    combinedBalance += a.balance;
    if (!highest || Math.abs(a.metrics.al_harq) > Math.abs(highest.al_harq)) {
      highest = {
        affiliateId: a.affiliateId,
        label: a.username,
        al_harq: a.metrics.al_harq,
      };
    }
  }

  return {
    active_agents: agents.length,
    total_network_burn: roundAgg(totalBurn),
    combined_balance: roundAgg(combinedBalance),
    highest_burn_agent: highest,
  };
}

function resolveChildLabel(child: DirectChildDbRow): string {
  return (
    child.display_name?.trim() ||
    child.texas_username?.trim() ||
    normalizeAffiliateId(child.texas_affiliate_id) ||
    child.id.slice(0, 8)
  );
}

/**
 * Merge DB direct children with Texas enrichment.
 * Visibility = DB only. Texas rows not linked to a direct child are dropped (fail-closed).
 */
export function mergeDirectChildrenWithTexas(
  dbChildren: DirectChildDbRow[],
  texasPayload: TexasSubAgentsPayload
): MergeDirectChildrenResult {
  const texasByAffiliate = indexTexasAgentsByAffiliate(texasPayload.agents);
  const agents: TexasSubAgentRow[] = [];
  const matchedTexasIds = new Set<string>();
  let childrenWithAffiliateId = 0;

  for (const dbChild of dbChildren) {
    const aid = normalizeAffiliateId(dbChild.texas_affiliate_id);
    if (aid) childrenWithAffiliateId += 1;

    const texasRow = findTexasRowForDbChild(
      texasByAffiliate,
      texasPayload.agents,
      dbChild
    );
    const matchedAid = normalizeAffiliateId(
      texasRow?.affiliateId ?? aid
    );

    if (texasRow && matchedAid) {
      matchedTexasIds.add(matchedAid);
      const displayLabel = resolveChildLabel(dbChild);
      agents.push({
        ...texasRow,
        user_id: dbChild.id,
        username: displayLabel,
        email: texasRow.email,
        has_live_texas_data: true,
      });
    } else {
      const label = resolveChildLabel(dbChild);
      agents.push({
        affiliateId: aid ?? `db:${dbChild.id}`,
        user_id: dbChild.id,
        username: label,
        email: dbChild.texas_username?.trim() || label,
        texasRole: dbChild.role ?? "agent",
        mainCurrency: "NSP",
        balance: 0,
        metrics: { ...ZERO_METRICS },
        has_live_texas_data: false,
      });
    }
  }

  const droppedTexasRows = texasPayload.agents.filter((a) => {
    const norm = normalizeAffiliateId(a.affiliateId);
    return norm ? !matchedTexasIds.has(norm) : true;
  }).length;

  return {
    agents,
    stats: computeSubAgentStats(agents),
    diagnostics: {
      dbDirectChildren: dbChildren.length,
      childrenWithAffiliateId,
      texasRowsTotal: texasPayload.agents.length,
      matchedEnriched: matchedTexasIds.size,
      stubCount: agents.length - matchedTexasIds.size,
      droppedTexasRows,
    },
  };
}

/** Per-child inclusion audit (for ops / support) */
export interface DirectChildVisibilityAuditRow {
  user_id: string;
  display_name: string | null;
  texas_affiliate_id: string | null;
  parent_id_match: boolean;
  is_active: boolean;
  included: boolean;
  has_live_texas_data: boolean;
  reason: string;
}

export function auditDirectChildVisibility(
  viewerId: string,
  dbChildren: DirectChildDbRow[],
  texasPayload: TexasSubAgentsPayload
): DirectChildVisibilityAuditRow[] {
  const texasByAffiliate = indexTexasAgentsByAffiliate(texasPayload.agents);
  return dbChildren.map((child) => {
    const aid = normalizeAffiliateId(child.texas_affiliate_id);
    const texasRow = findTexasRowForDbChild(
      texasByAffiliate,
      texasPayload.agents,
      child
    );
    const parentMatch = true; // rows already filtered by parent_id = viewerId

    if (!child.is_active) {
      return {
        user_id: child.id,
        display_name: child.display_name,
        texas_affiliate_id: child.texas_affiliate_id,
        parent_id_match: parentMatch,
        is_active: false,
        included: false,
        has_live_texas_data: false,
        reason: "excluded: is_active=false",
      };
    }

    if (!aid) {
      return {
        user_id: child.id,
        display_name: child.display_name,
        texas_affiliate_id: null,
        parent_id_match: parentMatch,
        is_active: true,
        included: true,
        has_live_texas_data: false,
        reason: "included: stub (no texas_affiliate_id)",
      };
    }

    if (texasRow) {
      return {
        user_id: child.id,
        display_name: child.display_name,
        texas_affiliate_id: aid,
        parent_id_match: parentMatch,
        is_active: true,
        included: true,
        has_live_texas_data: true,
        reason: "included: enriched from Texas stats/transfers",
      };
    }

    return {
      user_id: child.id,
      display_name: child.display_name,
      texas_affiliate_id: aid,
      parent_id_match: parentMatch,
      is_active: true,
      included: true,
      has_live_texas_data: false,
      reason:
        "included: stub (affiliate in DB but no Texas row match — wrong parent_id in DB, inactive sync, or ID mismatch)",
    };
  });
}
