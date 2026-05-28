import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isValidPhoneDigits,
  normalizePhoneDigits,
  normalizeWhatsAppPhone,
} from "@/lib/whatsapp/phone";

describe("normalizeWhatsAppPhone", () => {
  it("Syria local number", () => {
    const r = normalizeWhatsAppPhone("963", "0999888999");
    assert.equal(r.valid, true);
    assert.equal(r.digits, "963999888999");
  });

  it("UAE", () => {
    const r = normalizeWhatsAppPhone("971", "501234567");
    assert.equal(r.valid, true);
    assert.ok(r.digits.startsWith("971"));
  });

  it("Saudi Arabia", () => {
    const r = normalizeWhatsAppPhone("966", "512345678");
    assert.equal(r.valid, true);
    assert.ok(r.digits.startsWith("966"));
  });

  it("Turkey", () => {
    const r = normalizeWhatsAppPhone("90", "5321234567");
    assert.equal(r.valid, true);
    assert.ok(r.digits.startsWith("90"));
  });

  it("United States", () => {
    const r = normalizeWhatsAppPhone("1", "2025551234");
    assert.equal(r.valid, true);
    assert.ok(r.digits.startsWith("1"));
  });

  it("preserves already-normalized full number", () => {
    const full = "963988899474";
    const r = normalizeWhatsAppPhone("963", full);
    assert.equal(r.valid, true);
    assert.equal(r.digits, full);
  });

  it("rejects empty", () => {
    const r = normalizeWhatsAppPhone("963", "");
    assert.equal(r.valid, false);
  });
});

describe("isValidPhoneDigits", () => {
  it("accepts 7-15 digit E.164", () => {
    assert.equal(isValidPhoneDigits(normalizePhoneDigits("+963 988 899 474")), true);
  });
});
