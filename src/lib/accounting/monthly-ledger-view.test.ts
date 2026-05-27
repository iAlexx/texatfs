import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeMonthlyCumulativeLedgerView,
  resolveMonthStart,
} from "@/lib/accounting/monthly-ledger-view";

describe("monthly-ledger-view", () => {
  it("resolveMonthStart returns YYYY-MM-01", () => {
    assert.equal(resolveMonthStart("2026-05-27"), "2026-05-01");
  });

  it("accumulates day-by-day MTD + fixed carry (baqi_qadim)", () => {
    const rows = [
      { tebat: 10, suhoubat: 5, wasel_menho: 10, wasel_eleih: 13 },
      { tebat: 20, suhoubat: 7, wasel_menho: 10, wasel_eleih: 9 },
    ];

    // sums:
    // tebat=30, suhoubat=12 => al_farq=18
    // wasel_menho=20, wasel_eleih=22 => balanced (30+12=20+22=42)
    const carry = 1000;

    const view = computeMonthlyCumulativeLedgerView({
      ledgerDate: "2026-05-02",
      rowsFromMonthStartInclusive: rows,
      baqiQadimFixedCarry: carry,
    });

    assert.equal(view.tebatMtd, 30);
    assert.equal(view.suhoubatMtd, 12);
    assert.equal(view.waselMenhoMtd, 20);
    assert.equal(view.waselEleihMtd, 22);
    assert.equal(view.baqiQadimMtd, 1000);

    // al_nihai = al_farq + wasel_eleih - wasel_menho + baqi_qadim
    assert.equal(view.alNihaiMtd, 1020);
    assert.equal(view.discrepancyFlag, false);
  });

  it("carry changes across months (extra cash affects next baqi_qadim)", () => {
    const month1Rows = [
      {
        tebat: 10,
        suhoubat: 10,
        wasel_menho: 14,
        wasel_eleih: 6,
      },
    ];

    // balanced: tebat+suhoubat = 20, wasel_menho+wasel_eleih = 20
    // al_farq = 0
    // delta = wasel_eleih - wasel_menho = -8 => al_nihai = baqi - 8
    const initialCarry = 1000;
    const view1 = computeMonthlyCumulativeLedgerView({
      ledgerDate: "2026-05-15",
      rowsFromMonthStartInclusive: month1Rows,
      baqiQadimFixedCarry: initialCarry,
    });

    assert.equal(view1.baqiQadimMtd, 1000);
    assert.equal(view1.alNihaiMtd, 992);

    // month2 starts with baqi_qadim = last month end al_nihai
    const month2Rows = [
      { tebat: 5, suhoubat: 0, wasel_menho: 3, wasel_eleih: 2 },
    ];

    const view2 = computeMonthlyCumulativeLedgerView({
      ledgerDate: "2026-06-02",
      rowsFromMonthStartInclusive: month2Rows,
      baqiQadimFixedCarry: view1.alNihaiMtd,
    });

    assert.equal(view2.baqiQadimMtd, 992);
    assert.equal(view2.alNihaiMtd, 996);
    assert.equal(view2.discrepancyFlag, false);
  });
});

