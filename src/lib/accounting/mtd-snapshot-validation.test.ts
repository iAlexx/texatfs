import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertMohammadStyleMath,
  isValidMtdDailyRowsForDisplay,
  isValidMtdSnapshotForDisplay,
  liveTotalsHaveMoney,
  shouldSkipZeroPersistence,
} from "@/lib/accounting/mtd-snapshot-validation";
import type { MtdLedgerMetricsResult } from "@/lib/accounting/mtd-ledger-metrics";

function zeroMtdSnapshot(): MtdLedgerMetricsResult {
  return {
    tebatMtd: 0,
    suhoubatMtd: 0,
    waselMenhoMtd: 0,
    waselEleihMtd: 0,
    baqiQadimMtd: 0,
    alFarqMtd: 0,
    alHarqMtd: 0,
    alNihaiMtd: 0,
    discrepancyFlag: false,
    texasStrategy: "transaction_snapshot_delta",
    currentSnapshotFound: true,
    baselineSnapshotFound: true,
    dailyRowsCount: 0,
    isEmptyFallback: false,
  };
}

function validMtdSnapshot(): MtdLedgerMetricsResult {
  return {
    ...zeroMtdSnapshot(),
    tebatMtd: 2_500_000,
    suhoubatMtd: 11_100_000,
    alFarqMtd: -8_600_000,
    alHarqMtd: -8_600_000,
    alNihaiMtd: -8_600_000,
    isEmptyFallback: false,
  };
}

describe("mtd-snapshot-validation", () => {
  it("rejects zero MTD snapshot when live Texas has money", () => {
    const check = isValidMtdSnapshotForDisplay(zeroMtdSnapshot(), {
      totalDeposit: 2_500_000,
      totalWithdraw: 11_100_000,
    });
    assert.equal(check.valid, false);
    assert.equal(check.reason, "mtd_zero_live_nonempty");
  });

  it("accepts valid MTD snapshot with baseline", () => {
    const check = isValidMtdSnapshotForDisplay(validMtdSnapshot(), {
      totalDeposit: 2_500_000,
      totalWithdraw: 11_100_000,
    });
    assert.equal(check.valid, true);
  });

  it("shouldSkipZeroPersistence when fetched zero but live non-zero", () => {
    const skip = shouldSkipZeroPersistence(
      { totalDeposit: 0, totalWithdraw: 0 },
      { totalDeposit: 2_500_000, totalWithdraw: 11_100_000 }
    );
    assert.equal(skip.skip, true);
    assert.match(skip.reason, /prevent_zero/);
  });

  it("rejects zero daily rows when live has money", () => {
    const mtd: MtdLedgerMetricsResult = {
      ...zeroMtdSnapshot(),
      dailyRowsCount: 3,
      texasStrategy: "sum_daily_ledger_rows",
      currentSnapshotFound: false,
      baselineSnapshotFound: false,
    };
    const check = isValidMtdDailyRowsForDisplay(mtd, {
      totalDeposit: 1,
      totalWithdraw: 0,
    });
    assert.equal(check.valid, false);
  });

  it("mohammad55 math: deposit 2.5M withdraw 11.1M → farq -8.6M", () => {
    const { al_farq, al_harq } = assertMohammadStyleMath(2_500_000, 11_100_000);
    assert.equal(al_farq, -8_600_000);
    assert.equal(al_harq, -8_600_000);
  });

  it("liveTotalsHaveMoney detects non-zero", () => {
    assert.equal(
      liveTotalsHaveMoney({ totalDeposit: 0, totalWithdraw: 11_100_000 }),
      true
    );
    assert.equal(
      liveTotalsHaveMoney({ totalDeposit: 0, totalWithdraw: 0 }),
      false
    );
  });
});
