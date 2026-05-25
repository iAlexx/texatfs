/**
 * Fire-and-forget group spawn scheduler — fully isolated from webhook/register HTTP.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from "@/lib/observability/logger";
import { captureError } from "@/lib/observability/capture-error";
import { oncePerKey, withTimeout } from "@/lib/utils/async-retry";

const log = createLogger("whatsapp/group-spawn");

/**
 * Dedup window — reduced from 30min to 5min so a failed spawn
 * can be retried quickly by re-sending 😎.
 */
const SPAWN_DEDUP_TTL_MS = 5 * 60 * 1000;
const SPAWN_JOB_TIMEOUT_MS = 45 * 60 * 1000;

export function scheduleGroupSpawnJob(
  supabase: SupabaseClient,
  userId: string,
  masterPhoneDigits: string
): void {
  const dedupeKey = `spawn:${userId}`;
  if (!oncePerKey(dedupeKey, SPAWN_DEDUP_TTL_MS)) {
    log.info("duplicate spawn skipped (within dedup window)", { userId });
    return;
  }

  log.info("scheduling group spawn job", { userId, masterPhoneDigits: masterPhoneDigits.slice(-4) });

  void runGroupSpawnJob(supabase, userId, masterPhoneDigits).catch((err) => {
    log.error("unhandled error", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    void captureError(err, { scope: "whatsapp/group-spawn", userId });
  });
}

async function runGroupSpawnJob(
  supabase: SupabaseClient,
  userId: string,
  masterPhoneDigits: string
): Promise<void> {
  try {
    log.info("spawn job starting", { userId });
    const { spawnAgentGroupsForMaster } = await import(
      "@/lib/whatsapp/group-spawner"
    );
    const result = await withTimeout(
      spawnAgentGroupsForMaster(supabase, userId, masterPhoneDigits),
      SPAWN_JOB_TIMEOUT_MS,
      "group-spawn"
    );
    log.info("spawn completed", {
      userId,
      created: result.created,
      skipped: result.skipped,
      failed: result.failed,
    });
  } catch (err) {
    log.error("spawn failed", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    void captureError(err, { scope: "whatsapp/group-spawn", userId });
  }
}
