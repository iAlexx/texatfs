import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildLedgerMetrics,
  computeAlFarq,
  computeAlNihai,
  computeTebat,
  resolveBaqiQadim,
  assertAlNihaiFormula,
} from "@/lib/accounting/formulas";

describe("Accounting formulas", () => {
  const current = { totalDeposit: 150000, totalWithdraw: 110000, ngr: -5000 };
  const previous = { totalDeposit: 125000, totalWithdraw: 98000, ngr: -4200 };

  it("computes Tebat as deposit delta", () => {
    assert.equal(computeTebat(current, previous), 25000);
  });

  it("computes Al_Farq as Tebat - Suhoubat", () => {
    const tebat = 25000;
    const suhoubat = 12000;
    assert.equal(computeAlFarq(tebat, suhoubat), 13000);
  });

  it("carries Baqi_Qadim from previous Al_Nihai", () => {
    assert.equal(resolveBaqiQadim({ previousDayAlNihai: 22800 }), 22800);
    assert.equal(resolveBaqiQadim({ previousDayAlNihai: null }), 0);
  });

  it("computes Al_Nihai with Wasel fields", () => {
    const al_nihai = computeAlNihai({
      al_farq: 13000,
      wasel_menho: 500,
      wasel_eleih: 2000,
      baqi_qadim: 22800,
    });
    assert.equal(al_nihai, 37300);
  });

  it("buildLedgerMetrics satisfies DB check constraint", () => {
    const metrics = buildLedgerMetrics({
      current,
      previous,
      wasel_menho: 500,
      wasel_eleih: 2000,
      baqi_qadim: 22800,
    });
    assertAlNihaiFormula(metrics);
    assert.equal(metrics.tebat, 25000);
    assert.equal(metrics.suhoubat, 12000);
    assert.equal(metrics.al_farq, 13000);
    assert.equal(metrics.al_harq, metrics.al_farq);
  });

  it("Al_Harq equals Al_Farq per business rule", () => {
    const metrics = buildLedgerMetrics({
      current,
      previous,
      wasel_menho: 0,
      wasel_eleih: 0,
      baqi_qadim: 0,
    });
    assert.equal(metrics.al_harq, metrics.al_farq);
  });
});

describe("Deterministic ledger engine", () => {
  it("produces identical al_nihai for identical inputs", async () => {
    const { computeDeterministicLedger } = await import(
      "@/lib/accounting/ledger-engine"
    );
    const sources = {
      userId: "u1",
      ledgerDate: "2026-05-23",
      currentSnapshot: {
        balance: 1000,
        totalDeposit: 150000,
        totalWithdraw: 110000,
        ngr: -5000,
        currencyCode: "USD",
        rawWallets: {},
        rawStatistics: {},
      },
      previousSnapshot: {
        balance: 900,
        totalDeposit: 125000,
        totalWithdraw: 98000,
        ngr: -4200,
        currencyCode: "USD",
        rawWallets: {},
        rawStatistics: {},
      },
      wasel: { wasel_menho: 500, wasel_eleih: 2000 },
      previousDayAlNihai: 22800,
    };

    const a = computeDeterministicLedger(sources);
    const b = computeDeterministicLedger(sources);

    assert.equal(a.report.al_nihai, b.report.al_nihai);
    assert.equal(a.report.al_nihai, 37300);
    assert.equal(a.report.al_harq, a.report.al_farq);
  });
});
