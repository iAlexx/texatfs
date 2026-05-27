import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeAffiliateId } from "@/lib/texas/sub-agents-direct-merge";
import { inferViewerAffiliateFromTexasTree } from "@/lib/texas/texas-portal-hierarchy";

export async function resolveViewerTexasAffiliateId(
  supabase: SupabaseClient,
  userId: string,
  credsAffiliateId: string | null | undefined,
  texasParentByAffiliate: Map<string, string | null>
): Promise<string | null> {
  const fromCreds = normalizeAffiliateId(credsAffiliateId);
  if (fromCreds) return fromCreds;

  const { data: row } = await supabase
    .from("users")
    .select("texas_affiliate_id")
    .eq("id", userId)
    .maybeSingle();

  const fromDb = normalizeAffiliateId(row?.texas_affiliate_id);
  if (fromDb) return fromDb;

  const inferred = inferViewerAffiliateFromTexasTree(texasParentByAffiliate);
  if (inferred) {
    await supabase
      .from("users")
      .update({ texas_affiliate_id: inferred })
      .eq("id", userId)
      .is("texas_affiliate_id", null);

    console.info("[resolve-viewer-affiliate] inferred and saved", {
      userId,
      inferred,
    });
  }

  return inferred;
}
