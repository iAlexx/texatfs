import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getWhatsAppMaxMessagesPerMinute,
  randomInterMessageDelayMs,
  resolveGroupSpawnDelayMs,
} from "@/lib/whatsapp/rate-limiter";
import {
  isWhatsAppOptOutMessage,
  WHATSAPP_OPT_OUT_CONFIRM_AR,
} from "@/lib/whatsapp/opt-out";

describe("WhatsApp rate limiter", () => {
  it("defaults max 2 messages per minute", () => {
    delete process.env.WHATSAPP_MAX_MESSAGES_PER_MINUTE;
    assert.equal(getWhatsAppMaxMessagesPerMinute(), 2);
  });

  it("randomInterMessageDelayMs returns value in configured range", () => {
    process.env.WHATSAPP_INTER_MESSAGE_DELAY_MIN_MS = "500";
    process.env.WHATSAPP_INTER_MESSAGE_DELAY_MAX_MS = "1000";
    const d = randomInterMessageDelayMs();
    assert.ok(d >= 500 && d <= 1000);
  });

  it("resolveGroupSpawnDelayMs uses env bounds", () => {
    process.env.WHATSAPP_GROUP_CREATE_DELAY_MIN_MS = "10000";
    process.env.WHATSAPP_GROUP_CREATE_DELAY_MAX_MS = "12000";
    const d = resolveGroupSpawnDelayMs();
    assert.ok(d >= 10000 && d <= 12000);
  });
});

describe("WhatsApp opt-out", () => {
  it("recognizes STOP and Arabic opt-out", () => {
    assert.equal(isWhatsAppOptOutMessage("STOP"), true);
    assert.equal(isWhatsAppOptOutMessage("إيقاف"), true);
    assert.equal(isWhatsAppOptOutMessage("hello"), false);
  });

  it("confirmation message is Arabic", () => {
    assert.ok(WHATSAPP_OPT_OUT_CONFIRM_AR.includes("إيقاف"));
  });
});
