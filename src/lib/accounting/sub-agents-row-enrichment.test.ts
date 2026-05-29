import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  liveMetricsHaveData,
  liveMetricsToMtdShape,
  resolveSubAgentRowMetrics,
  mtdMetricsToSubAgentShape,
} from "@/lib/accounting/sub-agents-row-enrichment";
import {
  isMtdEmptyFallback,
  type MtdLedgerMetricsResult,
} from "@/lib/accounting/mtd-ledger-metrics";
import type { TexasSubAgentRow } from "@/lib/texas/texas-live-sub-agents";

function liveAgent(tebat: number, suhoubat = 0): TexasSubAgentRow {
  const al_farq = tebat - suhoubat;
  return {
    affiliateId: "aff-1",
    user_id: "user-1",
    username: "Agent One",
    email: "",
    texasRole: "agent",
    mainCurrency: "NSP",
    balance: 0,
    has_live_texas_data: true,
    metrics: {
      tebat,
      suhoubat,
      al_farq,
      al_harq: al_farq,
      wasel_menho: 0,
      wasel_eleih: 0,
      baqi_qadim: 0,
      al_nihai: al_farq,
    },
  };
}

function emptyMtdResult(): MtdLedgerMetricsResult {
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
    texasStrategy: "sum_daily_ledger_rows",
    currentSnapshotFound: false,
    baselineSnapshotFound: false,
    dailyRowsCount: 0,
    isEmptyFallback: true,
  };
}

function snapshotMtdResult(): MtdLedgerMetricsResult {
  return {
    tebatMtd: 3_000_000,
    suhoubatMtd: 500_000,
    waselMenhoMtd: 0,
    waselEleihMtd: 0,
    baqiQadimMtd: 0,
    alFarqMtd: 2_500_000,
    alHarqMtd: 2_500_000,
    alNihaiMtd: 2_500_000,
    discrepancyFlag: false,
    texasStrategy: "transaction_snapshot_delta",
    currentSnapshotFound: true,
    baselineSnapshotFound: true,
    dailyRowsCount: 0,
    isEmptyFallback: false,
  };
}

describe("sub-agents-row-enrichment", () => {
  it("live fallback: keeps non-zero Texas metrics when MTD is empty", () => {
    const agent = liveAgent(2_500_000, 100_000);
    const resolved = resolveSubAgentRowMetrics(agent, emptyMtdResult());

    assert.equal(resolved.metrics_source, "live_texas_fallback");
    assert.equal(resolved.metrics.tebat, 2_500_000);
    assert.equal(resolved.metrics.suhoubat, 100_000);
    assert.equal(resolved.metrics.al_farq, 2_400_000);
    assert.notEqual(resolved.metrics.tebat, 0);
  });

  it("snapshot without baseline uses live Texas not inflated lifetime MTD", () => {
    const agent = liveAgent(2_000_000, 100_000);
    const mtd: MtdLedgerMetricsResult = {
      ...emptyMtdResult(),
      tebatMtd: 99_000_000,
      suhoubatMtd: 50_000_000,
      alFarqMtd: 49_000_000,
      alHarqMtd: 49_000_000,
      alNihaiMtd: 49_000_000,
      texasStrategy: "transaction_snapshot_delta",
      currentSnapshotFound: true,
      baselineSnapshotFound: false,
      isEmptyFallback: true,
    };
    const resolved = resolveSubAgentRowMetrics(agent, mtd);
    assert.equal(resolved.metrics_source, "live_texas_fallback");
    assert.equal(resolved.metrics.tebat, 2_000_000);
  });

  it("MTD snapshot requires baseline snapshot", () => {
    const agent = liveAgent(999, 1);
    const resolved = resolveSubAgentRowMetrics(agent, snapshotMtdResult());

    assert.equal(resolved.metrics_source, "mtd_snapshot");
    assert.equal(resolved.metrics.tebat, 3_000_000);
    assert.equal(resolved.metrics.suhoubat, 500_000);
    assert.equal(resolved.mtd.current_snapshot_found, true);
  });

  it("regression: zero MTD snapshot with live 2.5M/11.1M uses live_texas_fallback", () => {
    const agent = liveAgent(2_500_000, 11_100_000);
    const mtd: MtdLedgerMetricsResult = {
      ...emptyMtdResult(),
      currentSnapshotFound: true,
      baselineSnapshotFound: true,
      texasStrategy: "transaction_snapshot_delta",
      isEmptyFallback: false,
    };
    const resolved = resolveSubAgentRowMetrics(agent, mtd);
    assert.equal(resolved.metrics_source, "live_texas_fallback");
    assert.equal(resolved.metrics.tebat, 2_500_000);
    assert.equal(resolved.metrics.suhoubat, 11_100_000);
    assert.equal(resolved.metrics.al_farq, -8_600_000);
    assert.equal(resolved.metrics.al_harq, -8_600_000);
  });

  it("valid MTD snapshot with matching live uses mtd_snapshot", () => {
    const agent = liveAgent(2_500_000, 11_100_000);
    const mtd: MtdLedgerMetricsResult = {
      ...emptyMtdResult(),
      tebatMtd: 2_500_000,
      suhoubatMtd: 11_100_000,
      alFarqMtd: -8_600_000,
      alHarqMtd: -8_600_000,
      alNihaiMtd: -8_600_000,
      currentSnapshotFound: true,
      baselineSnapshotFound: true,
      texasStrategy: "transaction_snapshot_delta",
      isEmptyFallback: false,
    };
    const resolved = resolveSubAgentRowMetrics(agent, mtd);
    assert.equal(resolved.metrics_source, "mtd_snapshot");
    assert.equal(resolved.metrics.al_farq, -8_600_000);
  });

  it("all empty: only then zero with empty_no_data", () => {
    const agent: TexasSubAgentRow = {
      ...liveAgent(0, 0),
      has_live_texas_data: false,
    };
    const mtd: MtdLedgerMetricsResult = {
      ...emptyMtdResult(),
      currentSnapshotFound: true,
      baselineSnapshotFound: true,
      isEmptyFallback: false,
    };
    const resolved = resolveSubAgentRowMetrics(agent, mtd);
    assert.equal(resolved.metrics_source, "empty_no_data");
    assert.equal(resolved.metrics.tebat, 0);
  });

  it("daily rows fallback: uses summed daily ledger rows", () => {
    const agent = liveAgent(50_000);
    const mtd: MtdLedgerMetricsResult = {
      ...emptyMtdResult(),
      tebatMtd: 800_000,
      suhoubatMtd: 50_000,
      alFarqMtd: 750_000,
      alHarqMtd: 750_000,
      alNihaiMtd: 750_000,
      dailyRowsCount: 5,
      isEmptyFallback: false,
    };

    const resolved = resolveSubAgentRowMetrics(agent, mtd);
    assert.equal(resolved.metrics_source, "mtd_daily_rows");
    assert.equal(resolved.metrics.tebat, 800_000);
  });

  it("empty no-data: only when no live Texas and no MTD rows/snapshot", () => {
    const agent: TexasSubAgentRow = {
      ...liveAgent(0, 0),
      has_live_texas_data: false,
    };
    const resolved = resolveSubAgentRowMetrics(agent, emptyMtdResult());

    assert.equal(resolved.metrics_source, "empty_no_data");
    assert.equal(resolved.metrics.tebat, 0);
  });

  it("liveMetricsHaveData detects non-zero Texas row", () => {
    assert.equal(liveMetricsHaveData(liveAgent(1)), true);
    assert.equal(liveMetricsHaveData(liveAgent(0, 0)), false);
  });

  it("isMtdEmptyFallback matches diagnostics contract", () => {
    assert.equal(isMtdEmptyFallback(emptyMtdResult()), true);
    assert.equal(isMtdEmptyFallback(snapshotMtdResult()), false);
  });

  it("two agents with different live metrics stay different after empty MTD", () => {
    const a = liveAgent(1_000_000);
    const b = liveAgent(2_000_000);
    const ra = resolveSubAgentRowMetrics(a, emptyMtdResult());
    const rb = resolveSubAgentRowMetrics(b, emptyMtdResult());
    assert.notEqual(ra.metrics.tebat, rb.metrics.tebat);
    assert.equal(ra.metrics_source, "live_texas_fallback");
    assert.equal(rb.metrics_source, "live_texas_fallback");
  });

  it("mtdMetricsToSubAgentShape carries diagnostics", () => {
    const shape = mtdMetricsToSubAgentShape(snapshotMtdResult());
    assert.equal(shape.current_snapshot_found, true);
    assert.equal(shape.tebat_mtd, 3_000_000);
  });

  it("liveMetricsToMtdShape mirrors live metrics", () => {
    const agent = liveAgent(123, 45);
    const mtd = liveMetricsToMtdShape(agent);
    assert.equal(mtd.tebat_mtd, 123);
    assert.equal(mtd.suhoubat_mtd, 45);
  });
});
