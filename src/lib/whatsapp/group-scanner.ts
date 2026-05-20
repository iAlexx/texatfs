import type { SupabaseClient } from "@supabase/supabase-js";
import { getEvolutionClient, type EvolutionGroup } from "@/lib/whatsapp/evolution-client";

const FIRE_EMOJI = "🔥";

export interface SyncedGroup {
  group_jid: string;
  group_name: string;
  is_fire_group: boolean;
}

/**
 * Fetch all WhatsApp groups from Evolution API and upsert them to DB.
 * Returns only 🔥 groups.
 */
export async function syncAndGetFireGroups(
  supabase: SupabaseClient,
  instanceId: string,
  instanceName: string,
  userId: string
): Promise<SyncedGroup[]> {
  const evo = getEvolutionClient();
  let groups: EvolutionGroup[] = [];

  try {
    groups = await evo.fetchAllGroups(instanceName);
  } catch (e) {
    console.error(
      "[group-scanner] fetchAllGroups failed",
      instanceName,
      e instanceof Error ? e.message : String(e)
    );
    return [];
  }

  if (!groups.length) return [];

  const rows = groups.map((g) => ({
    instance_id: instanceId,
    user_id: userId,
    group_jid: g.id,
    group_name: g.subject ?? g.id,
    is_fire_group: (g.subject ?? "").includes(FIRE_EMOJI),
  }));

  // Upsert all groups (sync name changes, fire status changes)
  const { error } = await supabase.from("whatsapp_groups").upsert(rows, {
    onConflict: "instance_id,group_jid",
  });

  if (error) {
    console.error("[group-scanner] upsert failed", error.message);
  }

  return rows
    .filter((r) => r.is_fire_group)
    .map(({ group_jid, group_name, is_fire_group }) => ({
      group_jid,
      group_name,
      is_fire_group,
    }));
}

/**
 * Fetch 🔥 groups from DB (no Evolution API call — uses saved data).
 * Used during cron to avoid repeated API calls.
 */
export async function getFireGroupsFromDb(
  supabase: SupabaseClient,
  instanceId: string
): Promise<SyncedGroup[]> {
  const { data, error } = await supabase
    .from("whatsapp_groups")
    .select("group_jid, group_name, is_fire_group")
    .eq("instance_id", instanceId)
    .eq("is_fire_group", true);

  if (error) {
    console.error("[group-scanner] getFireGroups DB failed", error.message);
    return [];
  }

  return (data ?? []) as SyncedGroup[];
}

/** Update last_report_sent_at for a group after sending. */
export async function markReportSent(
  supabase: SupabaseClient,
  instanceId: string,
  groupJid: string
): Promise<void> {
  await supabase
    .from("whatsapp_groups")
    .update({ last_report_sent_at: new Date().toISOString() })
    .eq("instance_id", instanceId)
    .eq("group_jid", groupJid);
}
