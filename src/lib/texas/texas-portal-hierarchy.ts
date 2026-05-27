import { pickString } from "@/lib/texas/field-resolver";
import { normalizeAffiliateId } from "@/lib/texas/sub-agents-direct-merge";
import type { TexasChildRecord } from "@/lib/texas/types";

const PARENT_AFFILIATE_KEYS = [
  "parent",
  "parentId",
  "parentAffiliateId",
  "parent_affiliate_id",
  "parentAgentId",
  "parent_agent_id",
] as const;

export interface TexasPortalChildRef {
  affiliateId: string;
  username: string | null;
  parentAffiliateId: string | null;
}

export function extractTexasParentAffiliateId(
  record: Record<string, unknown>
): string | null {
  return normalizeAffiliateId(pickString(record, PARENT_AFFILIATE_KEYS));
}

/**
 * True only when Texas row explicitly lists the viewer as parent.
 * Fail-closed: missing/unknown parent → NOT a direct child (no visibility expansion).
 */
export function isTexasPortalDirectChild(
  record: TexasChildRecord,
  viewerAffiliateId: string | null | undefined
): boolean {
  const viewerNorm = normalizeAffiliateId(viewerAffiliateId);
  if (!viewerNorm) return false;

  const bag = record as Record<string, unknown>;
  const parentNorm = extractTexasParentAffiliateId(bag);
  return parentNorm === viewerNorm;
}

export function filterTexasPortalDirectChildren(
  records: TexasChildRecord[],
  viewerAffiliateId: string | null | undefined
): TexasChildRecord[] {
  const filtered = records.filter((r) =>
    isTexasPortalDirectChild(r, viewerAffiliateId)
  );

  return filtered;
}

/**
 * Texas rows to sync into Supabase as viewer's direct children.
 *
 * - parent === viewer affiliate → direct child
 * - parent missing (common for agents just created in Texas panel) → treat as direct
 * - parent === someone else → grandchild, do NOT link under viewer
 */
function affiliateIdsInTree(records: TexasChildRecord[]): Set<string> {
  const set = new Set<string>();
  for (const record of records) {
    const id = normalizeAffiliateId(String(record.affiliateId ?? ""));
    if (id) set.add(id);
  }
  return set;
}

/**
 * When viewer texas_affiliate_id is missing, infer from getChildren parent map:
 * the affiliate referenced most often as parent is the session owner (master).
 */
export function inferViewerAffiliateFromTexasTree(
  texasParentByAffiliate: Map<string, string | null>
): string | null {
  const freq = new Map<string, number>();
  for (const parent of texasParentByAffiliate.values()) {
    const p = normalizeAffiliateId(parent);
    if (p) freq.set(p, (freq.get(p) ?? 0) + 1);
  }

  let best: string | null = null;
  let max = 0;
  for (const [id, count] of freq) {
    if (count > max) {
      max = count;
      best = id;
    }
  }
  return best;
}

/**
 * Texas rows to sync into Supabase as viewer's direct children.
 *
 * With viewer affiliate id:
 *   - parent === viewer, or parent missing (new panel agent)
 *
 * Without viewer affiliate id (fallback for masters missing DB field):
 *   - include unless parent points at another agent in the same getChildren tree (grandchild)
 */
export function collectTexasChildrenForDbLink(
  allChildren: TexasChildRecord[],
  viewerAffiliateId: string | null | undefined
): TexasPortalChildRef[] {
  const viewerNorm = normalizeAffiliateId(viewerAffiliateId);
  const inTree = affiliateIdsInTree(allChildren);

  const refs: TexasPortalChildRef[] = [];
  for (const record of allChildren) {
    const bag = record as Record<string, unknown>;
    const parentNorm = extractTexasParentAffiliateId(bag);

    if (viewerNorm) {
      if (parentNorm && parentNorm !== viewerNorm) continue;
    } else if (parentNorm && inTree.has(parentNorm)) {
      continue;
    }

    refs.push(toTexasPortalChildRef(record));
  }

  return refs;
}

export function toTexasPortalChildRef(record: TexasChildRecord): TexasPortalChildRef {
  const bag = record as Record<string, unknown>;
  const affiliateId = String(record.affiliateId ?? "");
  const username =
    (typeof record.username === "string" && record.username.trim()) ||
    (typeof record.email === "string" && record.email.trim()) ||
    null;

  return {
    affiliateId,
    username,
    parentAffiliateId: extractTexasParentAffiliateId(bag),
  };
}

export function buildParentAffiliateIndex(
  records: TexasChildRecord[]
): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const record of records) {
    const id = normalizeAffiliateId(String(record.affiliateId ?? ""));
    if (!id) continue;
    map.set(id, extractTexasParentAffiliateId(record as Record<string, unknown>));
  }
  return map;
}
