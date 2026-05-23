import { oncePerKey } from "@/lib/utils/async-retry";

const WEBHOOK_DEDUP_TTL_MS = 5 * 60 * 1000;

/** Idempotency guard for webhook delivery retries. */
export function shouldProcessWebhookEvent(
  source: "telegram" | "whatsapp",
  eventId: string
): boolean {
  if (!eventId) return true;
  return oncePerKey(`${source}:${eventId}`, WEBHOOK_DEDUP_TTL_MS);
}
