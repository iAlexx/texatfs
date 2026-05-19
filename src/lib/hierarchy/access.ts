import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Phase 7: Full subtree access (Super-Master → Master → Player).
 * Replaces direct-child-only checks.
 */
export async function assertCanViewUser(
  supabase: SupabaseClient,
  viewerId: string,
  targetUserId: string
): Promise<void> {
  if (viewerId === targetUserId) return;

  const { data, error } = await supabase.rpc("can_view_user_for", {
    p_viewer_id: viewerId,
    p_target_id: targetUserId,
  });

  if (error) throw error;
  if (!data) {
    throw new Error("غير مصرح بعرض هذا الحساب");
  }
}

export { canManageNetwork } from "@/lib/hierarchy/subtree-rules";
