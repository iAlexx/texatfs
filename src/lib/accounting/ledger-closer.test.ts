import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCalculationTrace,
  validateClosePreconditions,
} from "@/lib/accounting/ledger-closer";
import { LedgerLockError } from "@/lib/accounting/ledger-lock";

const baseMetrics = {
  tebat: 25000,
  suhoubat: 12000,
  al_farq: 13000,
  al_harq: 13000,
  wasel_menho: 500,
  wasel_eleih: 2000,
  baqi_qadim: 22800,
  al_nihai: 37300,
};

describe("ledger-closer", () => {
  it("buildCalculationTrace stores formula inputs", () => {
    const trace = buildCalculationTrace(baseMetrics);
    assert.equal(trace.al_nihai, 37300);
    assert.equal(trace.formula, "al_farq + wasel_eleih - wasel_menho + baqi_qadim");
    assert.ok(trace.closed_at);
  });

  it("validateClosePreconditions passes when open and formula holds", () => {
    assert.doesNotThrow(() =>
      validateClosePreconditions({
        status: "open",
        is_locked: false,
        closed_at: null,
        ...baseMetrics,
      })
    );
  });

  it("rejects already closed ledger", () => {
    assert.throws(
      () =>
        validateClosePreconditions({
          status: "closed",
          is_locked: true,
          closed_at: "2026-05-23T12:00:00Z",
          ...baseMetrics,
        }),
      (err: unknown) => err instanceof LedgerLockError && err.code === "LEDGER_ALREADY_CLOSED"
    );
  });

  it("rejects when al_nihai formula does not match", () => {
    assert.throws(() =>
      validateClosePreconditions({
        status: "open",
        is_locked: false,
        closed_at: null,
        ...baseMetrics,
        al_nihai: 99999,
      })
    );
  });
});
