/**
 * Process-local WhatsApp outbound rate limiter (WASender anti-ban).
 */
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("whatsapp/rate-limiter");

const sendTimestamps: number[] = [];

export function getWhatsAppMaxMessagesPerMinute(): number {
  const raw = Number(process.env.WHATSAPP_MAX_MESSAGES_PER_MINUTE ?? 2);
  return Number.isFinite(raw) && raw > 0 ? raw : 2;
}

function pruneOld(now: number, windowMs: number): void {
  while (sendTimestamps.length && now - sendTimestamps[0]! > windowMs) {
    sendTimestamps.shift();
  }
}

export function randomInterMessageDelayMs(): number {
  const min = Number(process.env.WHATSAPP_INTER_MESSAGE_DELAY_MIN_MS ?? 800);
  const max = Number(process.env.WHATSAPP_INTER_MESSAGE_DELAY_MAX_MS ?? 3500);
  const lo = Number.isFinite(min) ? min : 800;
  const hi = Number.isFinite(max) ? Math.max(max, lo) : 3500;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

export function resolveGroupSpawnDelayMs(): number {
  const min = Number(process.env.WHATSAPP_GROUP_CREATE_DELAY_MIN_MS ?? 12_000);
  const max = Number(process.env.WHATSAPP_GROUP_CREATE_DELAY_MAX_MS ?? 25_000);
  const lo = Number.isFinite(min) ? min : 12_000;
  const hi = Number.isFinite(max) ? Math.max(max, lo) : 25_000;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Blocks until a send slot is available; adds human-like jitter between sends. */
export async function acquireWhatsAppSendSlot(label = "send"): Promise<void> {
  const maxPerMin = getWhatsAppMaxMessagesPerMinute();
  const windowMs = 60_000;

  for (;;) {
    const now = Date.now();
    pruneOld(now, windowMs);

    if (sendTimestamps.length < maxPerMin) {
      await sleep(randomInterMessageDelayMs());
      sendTimestamps.push(Date.now());
      log.info("send slot acquired", {
        label,
        sentLastMinute: sendTimestamps.length,
        maxPerMin,
      });
      return;
    }

    const waitMs = windowMs - (now - sendTimestamps[0]!) + 50;
    log.warn("rate limit pause", { label, waitMs, maxPerMin });
    await sleep(Math.max(waitMs, 500));
  }
}

export function recordWhatsAppInboundReply(): void {
  log.info("inbound reply recorded", { repliesLastMinute: "n/a" });
}
