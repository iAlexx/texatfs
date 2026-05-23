/**
 * Fire-and-forget group spawn scheduler — fully isolated from webhook/register HTTP.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { spawnAgentGroupsForMaster } from "@/lib/whatsapp/group-spawner";

/**
 * Schedules group creation in the background. Errors are logged only;
 * they never reject the caller or block DB commits.
 */
export function scheduleGroupSpawnJob(
  supabase: SupabaseClient,
  userId: string,
  masterPhoneDigits: string
): void {
  void runGroupSpawnJob(supabase, userId, masterPhoneDigits).catch((err) => {
    console.error(
      "[group-spawn-job] unhandled error:",
      err instanceof Error ? err.message : String(err)
    );
  });
}

async function runGroupSpawnJob(
  supabase: SupabaseClient,
  userId: string,
  masterPhoneDigits: string
): Promise<void> {
  try {
    await spawnAgentGroupsForMaster(supabase, userId, masterPhoneDigits);
  } catch (err) {
    console.error(
      "[group-spawn-job] spawn failed:",
      err instanceof Error ? err.message : String(err)
    );
  }
}
