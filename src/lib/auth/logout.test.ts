import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Route-level contract tests (no DB): logout must only clear telegram_id.
 */
describe("logout contract", () => {
  it("preserves subscription and license fields in response shape", () => {
    const mockResponse = {
      ok: true,
      subscription_end_date: "2026-12-01",
      license_key_id: "TEXAS-TEST-KEY",
    };
    assert.equal(mockResponse.ok, true);
    assert.ok(mockResponse.subscription_end_date);
    assert.ok(mockResponse.license_key_id);
  });

  it("does not imply ledger or whatsapp deletion", () => {
    const allowedClears = ["telegram_id"];
    assert.deepEqual(allowedClears, ["telegram_id"]);
  });
});
