import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyMtdToSubAgentRow,
  mtdMetricsToSubAgentShape,
} from "@/lib/accounting/sub-agents-row-enrichment";
import type { TexasSubAgentRow } from "@/lib/texas/texas-live-sub-agents";

function baseAgent(
  userId: string,
  affiliateId: string,
  tebat: number
): TexasSubAgentRow {
  return {
    affiliateId,
    user_id: userId,
    username: `Agent ${affiliateId}`,
    email: "",
    texasRole: "agent",
    mainCurrency: "NSP",
    balance: 0,
    has_live_texas_data: true,
    metrics: {
      tebat: 0,
      suhoubat: 0,
      al_farq: 0,
      al_harq: 0,
      wasel_menho: 0,
      wasel_eleih: 0,
      baqi_qadim: 0,
      al_nihai: 0,
    },
  };
}

describe("sub-agents-row-enrichment", () => {
  it("applyMtdToSubAgentRow uses child metrics not master defaults", () => {
    const mtdA = mtdMetricsToSubAgentShape({
      tebatMtd: 1_000_000,
      suhoubatMtd: 200_000,
      waselMenhoMtd: 10,
      waselEleihMtd: 5,
      baqiQadimMtd: 100,
      alFarqMtd: 800_000,
      alHarqMtd: 800_000,
      alNihaiMtd: 795_000,
      discrepancyFlag: false,
      texasStrategy: "transaction_snapshot_delta",
    });
    const mtdB = mtdMetricsToSubAgentShape({
      tebatMtd: 2_000_000,
      suhoubatMtd: 50_000,
      waselMenhoMtd: 0,
      waselEleihMtd: 0,
      baqiQadimMtd: 0,
      alFarqMtd: 1_950_000,
      alHarqMtd: 1_950_000,
      alNihaiMtd: 1_950_000,
      discrepancyFlag: false,
      texasStrategy: "transaction_snapshot_delta",
    });

    const rowA = applyMtdToSubAgentRow(baseAgent("user-a", "aff-a", 1), mtdA);
    const rowB = applyMtdToSubAgentRow(baseAgent("user-b", "aff-b", 2), mtdB);

    assert.equal(rowA.user_id, "user-a");
    assert.equal(rowB.user_id, "user-b");
    assert.equal(rowA.metrics.tebat, 1_000_000);
    assert.equal(rowB.metrics.tebat, 2_000_000);
    assert.notEqual(rowA.metrics.tebat, rowB.metrics.tebat);
    assert.equal(rowA.mtd?.tebat_mtd, 1_000_000);
    assert.equal(rowB.mtd?.tebat_mtd, 2_000_000);
  });
});
