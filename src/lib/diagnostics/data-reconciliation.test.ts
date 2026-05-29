import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { reconcileFinancialTotals } from "@/lib/diagnostics/data-reconciliation";

describe("reconcileFinancialTotals", () => {
  it("returns OK when all sources align", () => {
    const r = reconcileFinancialTotals({
      texasTxDeposit: 1000,
      texasTxWithdraw: 200,
      snapshotDeposit: 1000,
      snapshotWithdraw: 200,
      ledgerTebat: 1000,
      ledgerSuhoubat: 200,
      displayedTebat: 1000,
      displayedSuhoubat: 200,
    });
    assert.equal(r.status, "OK");
  });

  it("returns ERROR when UI is zero but Texas has data", () => {
    const r = reconcileFinancialTotals({
      texasTxDeposit: 5000,
      texasTxWithdraw: 0,
      snapshotDeposit: null,
      snapshotWithdraw: null,
      ledgerTebat: null,
      ledgerSuhoubat: null,
      displayedTebat: 0,
      displayedSuhoubat: 0,
    });
    assert.equal(r.status, "ERROR");
    assert.ok(
      r.differences.some((d) => d.field === "ui_zero_while_texas_has_data")
    );
  });
});
