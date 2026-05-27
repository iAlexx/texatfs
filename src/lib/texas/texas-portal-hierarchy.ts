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
export function collectTexasChildrenForDbLink(
  allChildren: TexasChildRecord[],
  viewerAffiliateId: string | null | undefined
): TexasPortalChildRef[] {
  const viewerNorm = normalizeAffiliateId(viewerAffiliateId);
  if (!viewerNorm) return [];

  const refs: TexasPortalChildRef[] = [];
  for (const record of allChildren) {
    const bag = record as Record<string, unknown>;
    const parentNorm = extractTexasParentAffiliateId(bag);

    if (parentNorm && parentNorm !== viewerNorm) {
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
