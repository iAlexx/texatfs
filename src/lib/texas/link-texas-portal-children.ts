import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeAffiliateId } from "@/lib/texas/sub-agents-direct-merge";

/**
 * A direct agent returned by Texas POST /Agent/getChildren for the logged-in viewer.
 * This is the Texas portal's own "immediate downline" list — not statistics tree inference.
 */
export interface TexasPortalChildRef {
  affiliateId: string;
  username: string | null;
}

export interface LinkTexasPortalChildrenResult {
  attempted: number;
  linked: number;
  created: number;
  reparented: number;
  skipped: number;
}

/**
 * Ensures every Texas portal direct child has a `users` row with
 * `parent_id = viewerId`. Required for DB-authoritative sub-agent visibility.
 */
export async function linkTexasPortalDirectChildrenToViewer(
  supabase: SupabaseClient,
  viewerId: string,
  refs: TexasPortalChildRef[]
): Promise<LinkTexasPortalChildrenResult> {
  const result: LinkTexasPortalChildrenResult = {
    attempted: refs.length,
    linked: 0,
    created: 0,
    reparented: 0,
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

    const { error: updateErr } = await supabase
      .from("users")
      .update({ parent_id: viewerId })
      .eq("id", existing.id);

    if (updateErr) {
      console.warn("[link-texas-children] reparent failed", {
        viewerId,
        affiliateId,
        userId: existing.id,
        previousParentId: existing.parent_id,
        message: updateErr.message,
      });
      result.skipped += 1;
      continue;
    }

    console.info("[link-texas-children] reparented to viewer", {
      viewerId,
      affiliateId,
      userId: existing.id,
      previousParentId: existing.parent_id,
    });

    result.reparented += 1;
    result.linked += 1;
  }

  return result;
}
