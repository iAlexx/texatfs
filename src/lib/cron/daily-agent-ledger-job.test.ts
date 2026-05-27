import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldSkipDailyLedgerDispatch } from "@/lib/cron/daily-agent-ledger-job";

describe("daily-agent-ledger-job dedup helper", () => {
  it("skips when already sent", () => {
    const skip = shouldSkipDailyLedgerDispatch({
      existingStatus: "sent",
      lastAttemptAt: null,
      nowMs: 1_700_000_000_000,
      retryWindowMs: 20 * 60 * 1000,
    });
    assert.equal(skip, true);
  });

  it("skips retry when last attempt is inside retry window", () => {
    const now = 1_700_000_000_000;
    const lastAttemptAt = new Date(now - 5 * 60 * 1000).toISOString();

    const skip = shouldSkipDailyLedgerDispatch({
      existingStatus: "failed",
      lastAttemptAt,
      nowMs: now,
      retryWindowMs: 20 * 60 * 1000,
    });
    assert.equal(skip, true);
  });

  it("does not skip when last attempt is outside retry window", () => {
    const now = 1_700_000_000_000;
    const lastAttemptAt = new Date(now - 60 * 60 * 1000).toISOString();

    const skip = shouldSkipDailyLedgerDispatch({
      existingStatus: "failed",
      lastAttemptAt,
      nowMs: now,
      retryWindowMs: 20 * 60 * 1000,
    });
    assert.equal(skip, false);
  });
});

