import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isWhatsAppActivationMessage } from "@/lib/whatsapp/activation-message";

describe("isWhatsAppActivationMessage", () => {
  it("accepts 😎", () => {
    assert.equal(isWhatsAppActivationMessage("😎"), true);
  });

  it("accepts تفعيل", () => {
    assert.equal(isWhatsAppActivationMessage("تفعيل"), true);
  });

  it("accepts تم", () => {
    assert.equal(isWhatsAppActivationMessage("تم"), true);
  });

  it("accepts start case-insensitively", () => {
    assert.equal(isWhatsAppActivationMessage("start"), true);
    assert.equal(isWhatsAppActivationMessage("START"), true);
  });

  it("rejects unrelated text", () => {
    assert.equal(isWhatsAppActivationMessage("hello"), false);
    assert.equal(isWhatsAppActivationMessage(""), false);
  });
});
