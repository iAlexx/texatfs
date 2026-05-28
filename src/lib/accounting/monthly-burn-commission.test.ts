import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyMonthlyBurnCommission,
  computeBurnCommissionAmount,
  parseCommissionPercent,
} from "@/lib/accounting/monthly-burn-commission";

describe("computeBurnCommissionAmount", () => {
  it("burn 10M at 25% => 2.5M", () => {
    assert.equal(computeBurnCommissionAmount(10_000_000, 25), 2_500_000);
  });
});

describe("applyMonthlyBurnCommission", () => {
  const commission = 2_500_000;

  it("له (credit) increases credit magnitude", () => {
    const before = -5_000_000;
    const r = applyMonthlyBurnCommission(before, commission);
    assert.equal(r.orientation, "credit");
    assert.equal(r.finalAfterCommission, -7_500_000);
  });

  it("عليه (debit) decreases debt", () => {
    const before = 5_000_000;
    const r = applyMonthlyBurnCommission(before, commission);
    assert.equal(r.orientation, "debit");
    assert.equal(r.finalAfterCommission, 2_500_000);
  });

  it("عليه flips to له when commission exceeds debt", () => {
    const before = 2_000_000;
    const r = applyMonthlyBurnCommission(before, commission);
    assert.equal(r.orientation, "credit");
    assert.equal(r.finalAfterCommission, -500_000);
  });
});

describe("parseCommissionPercent", () => {
  it("parses common formats", () => {
    assert.equal(parseCommissionPercent("25"), 25);
    assert.equal(parseCommissionPercent("25%"), 25);
    assert.equal(parseCommissionPercent("نسبة 25"), 25);
    assert.equal(parseCommissionPercent("٢٥"), 25);
  });

  it("rejects invalid", () => {
    assert.equal(parseCommissionPercent("abc"), null);
    assert.equal(parseCommissionPercent("150"), null);
    assert.equal(parseCommissionPercent("-5"), null);
  });
});
