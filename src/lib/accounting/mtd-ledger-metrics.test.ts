import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildMtdLedgerMetrics,
  computeMtdFromTransactionSnapshots,
  isMtdEmptyFallback,
} from "@/lib/accounting/mtd-ledger-metrics";

describe("MTD cumulative from Transaction snapshots", () => {
  it("accumulates deposits/withdrawals from month baseline", () => {
    const baseline = { totalDeposit: 1_000_000, totalWithdraw: 0 };
    const current = { totalDeposit: 3_000_000, totalWithdraw: 500_000 };

    const { tebatMtd, suhoubatMtd } = computeMtdFromTransactionSnapshots(
      current,
      baseline
    );

    assert.equal(tebatMtd, 2_000_000);
    assert.equal(suhoubatMtd, 500_000);
  });

  it("May 2 example: cumulative 3M when day1=1M and day2 adds 2M via snapshots", () => {
    const may1End = { totalDeposit: 1_000_000, totalWithdraw: 0 };
    const aprEnd = { totalDeposit: 0, totalWithdraw: 0 };
    const mtdMay1 = computeMtdFromTransactionSnapshots(may1End, aprEnd);
    assert.equal(mtdMay1.tebatMtd, 1_000_000);

    const may2End = { totalDeposit: 3_000_000, totalWithdraw: 0 };
    const mtdMay2 = computeMtdFromTransactionSnapshots(may2End, aprEnd);
    assert.equal(mtdMay2.tebatMtd, 3_000_000);
  });

  it("al_harq mirrors al_farq in MTD build", () => {
    const mtd = buildMtdLedgerMetrics({
      tebatMtd: 3_000_000,
      suhoubatMtd: 500_000,
      waselMenhoMtd: 0,
      waselEleihMtd: 0,
      baqiQadimMtd: 100,
    });
    assert.equal(mtd.alFarqMtd, 2_500_000);
    assert.equal(mtd.alHarqMtd, mtd.alFarqMtd);
  });

  it("isMtdEmptyFallback is true only without snapshot or daily rows", () => {
    assert.equal(
      isMtdEmptyFallback({
        currentSnapshotFound: false,
        baselineSnapshotFound: false,
        dailyRowsCount: 0,
        isEmptyFallback: true,
      }),
      true
    );
    assert.equal(
      isMtdEmptyFallback({
        currentSnapshotFound: true,
        baselineSnapshotFound: true,
        dailyRowsCount: 0,
        isEmptyFallback: false,
      }),
      false
    );
  });
});
