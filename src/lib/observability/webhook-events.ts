/** In-memory ring buffer for recent webhook failures (resets on deploy). */

export type WebhookSource = "telegram" | "whatsapp";

export interface WebhookFailureEvent {
  ts: string;
  source: WebhookSource;
  step: string;
  message: string;
  requestId?: string;
}

const MAX_EVENTS = 50;
const failures: WebhookFailureEvent[] = [];

export function recordWebhookFailure(event: Omit<WebhookFailureEvent, "ts">): void {
  failures.unshift({ ts: new Date().toISOString(), ...event });
  if (failures.length > MAX_EVENTS) failures.length = MAX_EVENTS;
}

export function getRecentWebhookFailures(limit = 20): WebhookFailureEvent[] {
  return failures.slice(0, limit);
}
