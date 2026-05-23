import type { SupabaseClient } from "@supabase/supabase-js";
import { oncePerKey } from "@/lib/utils/async-retry";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("webhook/dedup");

const MEMORY_TTL_MS = 5 * 60 * 1000;

export type WebhookDedupSource = "telegram" | "whatsapp";

/**
 * Returns false when this event was already processed (duplicate delivery).
 * Uses DB when supabase is provided; falls back to in-memory TTL map.
 */
export async function shouldProcessWebhookEvent(
  source: WebhookDedupSource,
  eventKey: string,
  supabase?: SupabaseClient
): Promise<boolean> {
  if (!eventKey) return true;

  if (supabase) {
    const { error } = await supabase.from("webhook_dedup").insert({
      source,
      event_key: eventKey,
    });

    if (!error) return true;

    if (error.code === "23505") {
      log.info("duplicate skipped (db)", { source, eventKey: eventKey.slice(0, 32) });
      return false;
    }

    log.warn("db dedup insert failed — memory fallback", {
      source,
      error: error.message,
    });
  }

  return oncePerKey(`${source}:${eventKey}`, MEMORY_TTL_MS);
}

/** Best-effort cleanup of keys older than 7 days (call from cron if desired). */
export async function pruneWebhookDedup(
  supabase: SupabaseClient,
  olderThanDays = 7
): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);
  await supabase
    .from("webhook_dedup")
    .delete()
    .lt("received_at", cutoff.toISOString());
}
