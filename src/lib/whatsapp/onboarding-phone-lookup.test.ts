import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildWhatsAppPhoneLookupCandidates } from "@/lib/whatsapp/onboarding-phone-lookup";
import { isWhatsAppActivationMessage } from "@/lib/whatsapp/activation-message";

describe("WhatsApp activation", () => {
  it("accepts required activation phrases", () => {
    assert.equal(isWhatsAppActivationMessage("😎"), true);
    assert.equal(isWhatsAppActivationMessage("تفعيل"), true);
    assert.equal(isWhatsAppActivationMessage("تم"), true);
    assert.equal(isWhatsAppActivationMessage("start"), true);
    assert.equal(isWhatsAppActivationMessage("START"), true);
  });

  it("builds phone lookup candidates with country code", () => {
    const candidates = buildWhatsAppPhoneLookupCandidates("912345678");
    assert.ok(candidates.includes("963912345678"));
  });
});
