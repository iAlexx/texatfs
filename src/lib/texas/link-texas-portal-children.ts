import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeAffiliateId } from "@/lib/texas/sub-agents-direct-merge";
import type { TexasPortalChildRef } from "@/lib/texas/texas-portal-hierarchy";

export type { TexasPortalChildRef };

export interface LinkTexasPortalChildrenResult {
  attempted: number;
  linked: number;
  created: number;
  reparented: number;
  repaired: number;
  skipped: number;
}

/**
 * Create missing users for verified Texas portal direct children only.
 * NEVER reparent existing users — that incorrectly pulls grandchildren under the viewer.
 */
export async function ensureTexasPortalDirectChildrenInDb(
  supabase: SupabaseClient,
  viewerId: string,
  refs: TexasPortalChildRef[]
): Promise<LinkTexasPortalChildrenResult> {
  const result: LinkTexasPortalChildrenResult = {
    attempted: refs.length,
    linked: 0,
    created: 0,
    reparented: 0,
    repaired: 0,
    skipped: 0,
  };

  for (const ref of refs) {
    const affiliateId = normalizeAffiliateId(ref.affiliateId);
    if (!affiliateId) {
      result.skipped += 1;
      continue;
    }

    const { data: existing } = await supabase
      .from("users")
      .select("id, parent_id")
      .eq("texas_affiliate_id", affiliateId)
      .maybeSingle();

    if (!existing) {
      const displayName = ref.username?.trim() || `agent-${affiliateId}`;
      const { error: insertErr } = await supabase.from("users").insert({
        role: "agent",
        parent_id: viewerId,
        texas_affiliate_id: affiliateId,
        texas_username: ref.username,
        display_name: displayName,
        registered_via: "texas_portal_children",
        is_active: true,
      });

      if (insertErr) {
        console.warn("[link-texas-children] create failed", {
          viewerId,
          affiliateId,
          message: insertErr.message,
        });
        result.skipped += 1;
        continue;
      }

      result.created += 1;
      result.linked += 1;
      continue;
    }

    if (existing.parent_id === viewerId) {
      result.linked += 1;
      continue;
    }

    // Existing user belongs to another parent — do NOT steal them
    console.info("[link-texas-children] skip existing user (different parent)", {
      viewerId,
      affiliateId,
      userId: existing.id,
      existingParentId: existing.parent_id,
    });
    result.skipped += 1;
  }

  return result;
}

/**
 * Undo mistaken parent_id=viewer assignments using Texas parent affiliate metadata.
 * Only moves users who are currently listed as direct children of viewer but whose
 * Texas parent is another affiliate (e.g. alex2000 under alex2001, not master).
 */
export async function repairMisassignedDirectChildren(
  supabase: SupabaseClient,
  viewerId: string,
  viewerAffiliateId: string | null | undefined,
  texasParentByAffiliate: Map<string, string | null>,
  trueDirectAffiliateIds: Set<string>
): Promise<number> {
  const viewerNorm = normalizeAffiliateId(viewerAffiliateId);
  if (!viewerNorm) return 0;

  const { data: currentChildren, error } = await supabase
    .from("users")
    .select("id, texas_affiliate_id, parent_id")
    .eq("parent_id", viewerId)
    .eq("is_active", true);

  if (error || !currentChildren?.length) return 0;

  let repaired = 0;

  for (const row of currentChildren) {
    const childAff = normalizeAffiliateId(row.texas_affiliate_id);
    if (!childAff) continue;

    if (trueDirectAffiliateIds.has(childAff)) continue;

    const texasParentAff = texasParentByAffiliate.get(childAff);
    if (!texasParentAff || texasParentAff === viewerNorm) {
      continue;
    }

    const { data: trueParentUser } = await supabase
      .from("users")
      .select("id")
      .eq("texas_affiliate_id", texasParentAff)
      .eq("is_active", true)
      .maybeSingle();

    const newParentId = trueParentUser?.id ?? null;
    if (newParentId === row.parent_id) continue;

    const { error: updateErr } = await supabase
      .from("users")
      .update({ parent_id: newParentId })
      .eq("id", row.id);

    if (updateErr) {
      console.warn("[link-texas-children] repair failed", {
        viewerId,
        childUserId: row.id,
        childAffiliateId: childAff,
        texasParentAff,
        message: updateErr.message,
      });
      continue;
    }

    console.info("[link-texas-children] repaired misassigned child", {
      viewerId,
      childUserId: row.id,
      childAffiliateId: childAff,
      texasParentAffiliateId: texasParentAff,
      newParentId,
    });
    repaired += 1;
  }

  return repaired;
}
