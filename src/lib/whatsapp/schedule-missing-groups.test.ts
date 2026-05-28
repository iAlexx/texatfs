import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkWhatsAppEnv,
  computeMissingGroupTargets,
  WHATSAPP_AUTO_SKIP_NO_PHONE,
} from "@/lib/whatsapp/schedule-missing-groups";
import type { DirectChildDbRow } from "@/lib/texas/sub-agents-direct-merge";

describe("computeMissingGroupTargets", () => {
  const childA: DirectChildDbRow = {
    id: "u-a",
    texas_affiliate_id: "aff-a",
    display_name: "Agent A",
    texas_username: "a@test",
    role: "agent",
    is_active: true,
  };

  const childB: DirectChildDbRow = {
    id: "u-b",
    texas_affiliate_id: "aff-b",
    display_name: "Agent B",
    texas_username: null,
    role: "agent",
    is_active: true,
  };

  it("returns only children without active mapping", () => {
    const active = new Set(["aff-a"]);
    const missing = computeMissingGroupTargets([childA, childB], active);
    assert.equal(missing.length, 1);
    assert.equal(missing[0]!.affiliateId, "aff-b");
    assert.equal(missing[0]!.displayName, "Agent B");
  });

  it("skips children without texas_affiliate_id", () => {
    const noAffiliate: DirectChildDbRow = {
      ...childA,
      id: "u-stub",
      texas_affiliate_id: null,
    };
    const missing = computeMissingGroupTargets([noAffiliate], new Set());
    assert.equal(missing.length, 0);
  });
});

describe("checkWhatsAppEnv", () => {
  it("exposes skip message constant", () => {
    assert.match(
      WHATSAPP_AUTO_SKIP_NO_PHONE,
      /whatsapp_phone missing/i
    );
  });

  it("reports missing token when env unset", () => {
    const prev = process.env.WHATSAPP_API_TOKEN;
    delete process.env.WHATSAPP_API_TOKEN;
    try {
      const status = checkWhatsAppEnv();
      assert.equal(status.tokenConfigured, false);
      assert.ok(status.missing.includes("WHATSAPP_API_TOKEN"));
    } finally {
      if (prev !== undefined) {
        process.env.WHATSAPP_API_TOKEN = prev;
      }
    }
  });
});
